const {
Client,
GatewayIntentBits,
REST,
Routes,
SlashCommandBuilder,
ChannelType,
PermissionFlagsBits,
EmbedBuilder,
ActionRowBuilder,
StringSelectMenuBuilder,
ButtonBuilder,
ButtonStyle,
WebhookClient
} = require("discord.js");

const fs = require(“fs”);
const path = require(“path”);

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
throw new Error(“Missing TOKEN, CLIENT_ID, or GUILD_ID environment variable.”);
}

const client = new Client({
intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = path.join(__dirname, “market-data.json”);

const TYPES = [
{ label: “شراء حساب”, value: “buy_account”, emoji: “🛒” },
{ label: “بيع حساب”, value: “sell_account”, emoji: “💰” },
{ label: “شراء روبوكس”, value: “buy_robux”, emoji: “💎” },
{ label: “بيع روبوكس”, value: “sell_robux”, emoji: “💵” },
{ label: “تبادل حسابات”, value: “trade_accounts”, emoji: “🔄” },
{ label: “أخرى”, value: “other”, emoji: “📦” }
];

let config = {
mediationChannelId: null
};

const queues = new Map();
const matches = new Map();
const activeUsers = new Set();

function loadConfig() {
try {
if (fs.existsSync(DATA_FILE)) {
const saved = JSON.parse(fs.readFileSync(DATA_FILE, “utf8”));
config = { …config, …saved };
}
} catch (error) {
console.error(“Could not load configuration:”, error);
}
}

function saveConfig() {
fs.writeFileSync(DATA_FILE, JSON.stringify(config, null, 2));
}

function makeId() {
return ${Date.now().toString(36)}${Math.random() .toString(36) .slice(2, 9)};
}

function getTypeLabel(value) {
return TYPES.find(type => type.value === value)?.label || value;
}

function isAdmin(interaction) {
return interaction.memberPermissions?.has(
PermissionFlagsBits.Administrator
);
}

function typeMenu() {
const menu = new StringSelectMenuBuilder()
.setCustomId(“market:select”)
.setPlaceholder(“اختر نوع الطلب”)
.setMinValues(1)
.setMaxValues(1)
.addOptions(
TYPES.map(type => ({
label: type.label,
value: type.value,
emoji: type.emoji,
description: انتظر شخصًا آخر يختار ${type.label}
}))
);

return new ActionRowBuilder().addComponents(menu);
}

function choiceRows(matchId) {
const row = new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(match:mediated:${matchId})
.setLabel(“مع وسيط”)
.setEmoji(“🤝”)
.setStyle(ButtonStyle.Success),

new ButtonBuilder()
  .setCustomId(`match:direct:${matchId}`)
  .setLabel("بدون وسيط")
  .setEmoji("⚡")
  .setStyle(ButtonStyle.Secondary)

);

return [row];
}

function mediatorRequestRow(matchId) {
return [
new ActionRowBuilder().addComponents(
new ButtonBuilder()
.setCustomId(match:request_mediator:${matchId})
.setLabel(“طلب وسيط”)
.setEmoji(“🤝”)
.setStyle(ButtonStyle.Primary)
)
];
}

function getMatchContent(match, userId) {
const otherId = match.users.find(id => id !== userId);

return [
“🎉 تم العثور على شخص يطابق طلبك!”,
“”,
📦 نوع الطلب: **${getTypeLabel(match.type)}**,
👤 الطرف الثاني: <@${otherId}>,
“”,
“اختر طريقة التعامل:”,
“🤝 مع وسيط”,
“⚡ بدون وسيط”
].join(”\n”);
}

async function editPrivateMessage(entry, payload) {
try {
await entry.interaction.editReply(payload);
return true;
} catch (error) {
console.warn(“Could not edit the original private response:”, error.message);

try {
  await entry.interaction.user.send(
    "🔔 عندك تحديث في المطابقة. ارجع إلى روم المطابقة في سيرفرك."
  );
} catch {
  // The user may have disabled direct messages.
}
return false;

}
}

async function startMatch(interaction, type) {
const userId = interaction.user.id;

if (activeUsers.has(userId)) {
await interaction.editReply({
content: “⚠️ أنت داخل مطابقة بالفعل. أنهِها أولًا قبل طلب مطابقة ثانية.”,
components: []
});
return;
}

const waiting = queues.get(type) || [];

const partnerIndex = waiting.findIndex(
entry => entry.userId !== userId
);

if (partnerIndex === -1) {
waiting.push({
userId,
interaction,
createdAt: Date.now()
});

queues.set(type, waiting);
await interaction.editReply({
  content:
    `⏳ **طلبك قيد الانتظار**\n\n` +
    `📦 النوع: **${getTypeLabel(type)}**\n` +
    "ما راح يوصلك طلب شخص اختار نوعًا مختلفًا. بنبلغك إذا لقينا شخصًا يختار النوع نفسه.",
  components: []
});
return;

}

const [partner] = waiting.splice(partnerIndex, 1);
queues.set(type, waiting);

const matchId = makeId();

const match = {
id: matchId,
type,
users: [partner.userId, userId],
choices: {},
mediatorRequested: false,
completed: false,
guildId: interaction.guildId,
channelId: interaction.channelId,
createdAt: Date.now()
};

matches.set(matchId, match);
activeUsers.add(partner.userId);
activeUsers.add(userId);

const payloadForPartner = {
content: getMatchContent(match, partner.userId),
components: choiceRows(matchId)
};

const payloadForCurrent = {
content: getMatchContent(match, userId),
components: choiceRows(matchId)
};

await Promise.all([
editPrivateMessage(partner, payloadForPartner),
interaction.editReply(payloadForCurrent)
]);
}

async function handleChoice(interaction, matchId, choice) {
const match = matches.get(matchId);

if (!match || !match.users.includes(interaction.user.id)) {
await interaction.reply({
content: “❌ المطابقة غير موجودة أو انتهت.”,
ephemeral: true
});
return;
}

if (match.completed) {
await interaction.reply({
content: “⚠️ تم إغلاق هذه المطابقة.”,
ephemeral: true
});
return;
}

match.choices[interaction.user.id] = choice;

const otherId = match.users.find(id => id !== interaction.user.id);
const otherChoice = match.choices[otherId];

if (!otherChoice) {
const text = choice === “mediated”
? “🤝 اخترت مع وسيط.\n⏳ ننتظر اختيار الطرف الثاني.”
: “⚡ اخترت بدون وسيط.\n⏳ ننتظر اختيار الطرف الثاني.”;

await interaction.update({
  content: text,
  components: choiceRows(matchId)
});
return;

}

if (otherChoice !== choice) {
await interaction.update({
content:
“⚠️ اختياراتكم مختلفة!\n\n” +
“لازم الطرفين يختارون نفس الطريقة. تقدر تغيّر اختيارك من الأزرار.”,
components: choiceRows(matchId)
});

const otherEntry = {
  interaction: {
    editReply: async payload => {
      // This fallback is intentionally not used to send messages
      // to another user; the other user can change their own choice.
      return payload;
    }
  }
};
void otherEntry;
return;

}

if (choice === “mediated”) {
await interaction.update({
content:
“🤝 تم الاتفاق على الوساطة!\n\n” +
“اضغط طلب وسيط عشان نرسل طلبكم إلى روم الوساطة.”,
components: mediatorRequestRow(matchId)
});

return;

}

match.completed = true;

await interaction.update({
content:
“✅ تم الاتفاق بدون وسيط.\n\n” +
الطرف الثاني: <@${otherId}>\n +
“تقدرون تكملون اتفاقكم بينكم.”,
components: []
});

matches.delete(matchId);
activeUsers.delete(match.users[0]);
activeUsers.delete(match.users[1]);
}

async function handleMediatorRequest(interaction, matchId) {
const match = matches.get(matchId);

if (!match || !match.users.includes(interaction.user.id)) {
await interaction.reply({
content: “❌ المطابقة غير موجودة أو انتهت.”,
ephemeral: true
});
return;
}

if (match.completed) {
await interaction.reply({
content: “⚠️ تم إغلاق هذه المطابقة.”,
ephemeral: true
});
return;
}

if (!match.users.every(id => match.choices[id] === “mediated”)) {
await interaction.reply({
content: “⚠️ لازم الطرفين يختارون «مع وسيط» أولًا.”,
ephemeral: true
});
return;
}

if (match.mediatorRequested) {
await interaction.reply({
content: “✅ طلب الوسيط انرسل من قبل.”,
ephemeral: true
});
return;
}

const channelId = config.mediationChannelId;

if (!channelId) {
await interaction.reply({
content:
“❌ ما تم تحديد روم الوساطة. خلّ الإدارة تستخدم أمر /mediation-channel أولًا.”,
ephemeral: true
});
return;
}

const channel = await client.channels.fetch(channelId).catch(() => null);

if (!channel || !channel.isTextBased() || !channel.send) {
await interaction.reply({
content:
“❌ روم الوساطة المحفوظ غير متاح. خلّ الإدارة تعيّن الروم من جديد.”,
ephemeral: true
});
return;
}

match.mediatorRequested = true;

const embed = new EmbedBuilder()
.setColor(0x2ecc71)
.setTitle(“🤝 طلب وساطة جديد”)
.setDescription(
[
📦 **نوع الطلب:** ${getTypeLabel(match.type)},
“”,
👤 **الطرف الأول:** <@${match.users[0]}>,
👤 **الطرف الثاني:** <@${match.users[1]}>,
“”,
“الطرفان اختارا إتمام الاتفاق مع وسيط.”,
🆔 **رقم الطلب:** \${match.id}``
].join(”\n”)
)
.setTimestamp();

try {
await channel.send({
content:
🔔 طلب وساطة جديد: <@${match.users[0]}> و <@${match.users[1]}>,
embeds: [embed],
allowedMentions: {
users: match.users
}
});

await interaction.reply({
  content: "✅ تم إرسال طلب الوساطة إلى الروم المحدد.",
  ephemeral: true
});
match.completed = true;
matches.delete(matchId);
activeUsers.delete(match.users[0]);
activeUsers.delete(match.users[1]);

} catch (error) {
match.mediatorRequested = false;
console.error(“Failed to send mediation request:”, error);

await interaction.reply({
  content: "❌ ما قدرت أرسل الطلب. تأكد من صلاحيات البوت في روم الوساطة.",
  ephemeral: true
});

}
}

const commands = [
new SlashCommandBuilder()
.setName(“market-panel”)
.setDescription(“إرسال لوحة المطابقة إلى الروم الذي تختاره”)
.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
.addChannelOption(option =>
option
.setName(“channel”)
.setDescription(“الروم الذي تريد إرسال لوحة المطابقة إليه”)
.addChannelTypes(ChannelType.GuildText)
.setRequired(true)
),

new SlashCommandBuilder()
.setName(“mediation-channel”)
.setDescription(“تحديد روم استقبال طلبات الوساطة”)
.setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
.addChannelOption(option =>
option
.setName(“channel”)
.setDescription(“روم الوساطة”)
.addChannelTypes(ChannelType.GuildText)
.setRequired(true)
)
].map(command => command.toJSON());

client.once(“ready”, async () => {
console.log(Logged in as ${client.user.tag});

loadConfig();

const rest = new REST({ version: “10” }).setToken(TOKEN);

try {
await rest.put(
Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
{ body: commands }
);

console.log("Slash commands registered.");

} catch (error) {
console.error(“Could not register slash commands:”, error);
}
});

client.on(“interactionCreate”, async interaction => {
try {
if (interaction.isChatInputCommand()) {
if (!isAdmin(interaction)) {
await interaction.reply({
content: “❌ هذا الأمر للإدارة فقط.”,
ephemeral: true
});
return;
}

  if (interaction.commandName === "market-panel") {
    const channel = interaction.options.getChannel("channel");
    const embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("🛒 نظام مطابقة الطلبات")
      .setDescription(
        [
          "اختر نوع الطلب من القائمة بالأسفل.",
          "",
          "• طلبك ينتظر شخصًا يختار النوع نفسه.",
          "• ما راح يتم عرض طلبك على الجميع.",
          "• بعد المطابقة، كل طرف يستلم رسالته الخاصة.",
          "• تقدرون تختارون مع وسيط أو بدون وسيط."
        ].join("\n")
      )
      .setFooter({ text: "Karen Rank • Market Matching" });
    await channel.send({
      embeds: [embed],
      components: [typeMenu()]
    });
    await interaction.reply({
      content: `✅ تم إرسال لوحة المطابقة في ${channel}.`,
      ephemeral: true
    });
    return;
  }
  if (interaction.commandName === "mediation-channel") {
    const channel = interaction.options.getChannel("channel");
    config.mediationChannelId = channel.id;
    saveConfig();
    await interaction.reply({
      content: `✅ تم تحديد روم الوساطة: ${channel}`,
      ephemeral: true
    });
    return;
  }
}
if (interaction.isStringSelectMenu()) {
  if (interaction.customId !== "market:select") return;
  const type = interaction.values[0];
  if (!TYPES.some(item => item.value === type)) {
    await interaction.reply({
      content: "❌ نوع الطلب غير صالح.",
      ephemeral: true
    });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  await startMatch(interaction, type);
  return;
}
if (interaction.isButton()) {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "match") return;
  const action = parts[1];
  const matchId = parts[2];
  if (action === "mediated") {
    await handleChoice(interaction, matchId, "mediated");
    return;
  }
  if (action === "direct") {
    await handleChoice(interaction, matchId, "direct");
    return;
  }
  if (action === "request_mediator") {
    await handleMediatorRequest(interaction, matchId);
  }
}

} catch (error) {
console.error(“Interaction error:”, error);

if (!interaction.isRepliable()) return;
try {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({
      content: "❌ صار خطأ غير متوقع. حاول مرة ثانية.",
      ephemeral: true
    });
  } else {
    await interaction.reply({
      content: "❌ صار خطأ غير متوقع. حاول مرة ثانية.",
      ephemeral: true
    });
  }
} catch {
  // The interaction may have expired.
}

}
});

loadConfig();
client.login(TOKEN);
