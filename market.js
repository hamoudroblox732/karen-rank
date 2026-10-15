const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const MIDDLEMAN_ROLE_ID = "1559877945441648773";

const queues = new Map();
const matches = new Map();
const middlemanRequests = new Map();
const activeUsers = new Set();
const queuedUsers = new Set();

let mediationChannelId = null;

const categories = [
  { label: "شراء حساب", value: "buy_account", emoji: "🛒" },
  { label: "بيع حساب", value: "sell_account", emoji: "💰" },
  { label: "شراء أغراض داخل لعبة", value: "buy_items", emoji: "🎮" },
  { label: "بيع أغراض داخل لعبة", value: "sell_items", emoji: "📦" },
  { label: "شراء أغراض أخرى", value: "buy_misc", emoji: "🛍️" },
  { label: "بيع أغراض أخرى", value: "sell_misc", emoji: "💎" }
];

const commands = [
  new SlashCommandBuilder()
    .setName("marketpanel")
    .setDescription("إرسال لوحة مطابقة السوق"),

  new SlashCommandBuilder()
    .setName("setmiddlemanchannel")
    .setDescription("تحديد روم استقبال طلبات الوساطة")
    .setDefaultMemberPermissions(
      PermissionsBitField.Flags.Administrator
    )
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("اختر روم الوساطة")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
].map(command => command.toJSON());

function isAdmin(interaction) {
  return Boolean(
    interaction.guild &&
    (
      interaction.user.id === interaction.guild.ownerId ||
      interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator
      )
    )
  );
}

function getCategory(value) {
  return categories.find(category => category.value === value);
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createMarketPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("『 KAREN RANK ・ MARKET 』")
    .setDescription(
      "مرحبًا بك في نظام مطابقة السوق!\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "📦 اختر نوع الطلب من القائمة.\n\n" +
      "⏳ إذا ما فيه شخص يطلب النوع نفسه، بينتظر طلبك.\n\n" +
      "🤝 إذا تطابقت طلباتكم، كل واحد توصله رسالة خاصة " +
      "داخل ديسكورد فيها منشن الطرف الثاني.\n\n" +
      "🛡️ بعدها تختارون مع وسيط أو بدون وسيط.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      "⚠️ لا تشارك كلمات المرور أو رموز التحقق."
    )
    .setFooter({ text: "Karen Rank • Market Matching" })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId("market:select")
    .setPlaceholder("اختر نوع طلبك")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      categories.map(category => ({
        label: category.label,
        value: category.value,
        emoji: category.emoji
      }))
    );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu)
    ]
  };
}

function choiceButtons(matchId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`market:choice:mediated:${matchId}`)
        .setLabel("مع وسيط")
        .setEmoji("🤝")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`market:choice:direct:${matchId}`)
        .setLabel("بدون وسيط")
        .setEmoji("⚡")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function mediatorButtons(matchId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`market:requestmediator:${matchId}`)
        .setLabel("طلب وسيط")
        .setEmoji("🤝")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

function getMatchMessage(match, userId) {
  const otherId = match.users.find(id => id !== userId);
  const category = getCategory(match.type);

  return (
    "🎉 تم العثور على شخص يطابق طلبك!\n\n" +
    `📦 **نوع الطلب:** ${category.label}\n` +
    `👤 **الطرف الثاني:** <@${otherId}>\n\n` +
    "اختر طريقة إتمام الصفقة من الأزرار بالأسفل."
  );
}

async function updatePrivate(entry, content, components = []) {
  try {
    await entry.editReply({
      content,
      embeds: [],
      components
    });

    return true;
  } catch (error) {
    console.error(
      "Could not update private match response:",
      error.message
    );

    return false;
  }
}

async function finishMatch(match) {
  matches.delete(match.id);

  for (const userId of match.users) {
    activeUsers.delete(userId);
  }
}

async function findMatch(interaction, type) {
  const userId = interaction.user.id;

  if (activeUsers.has(userId)) {
    await interaction.editReply({
      content: "⚠️ أنت داخل مطابقة حالية. أنهِ المطابقة أولًا.",
      components: []
    });
    return;
  }

  if (queuedUsers.has(userId)) {
    await interaction.editReply({
      content: "⚠️ لديك طلب آخر في قائمة الانتظار بالفعل.",
      components: []
    });
    return;
  }

  const waiting = queues.get(type) || [];
  const index = waiting.findIndex(entry => entry.userId !== userId);

  if (index === -1) {
    waiting.push({
      userId,
      interaction
    });

    queues.set(type, waiting);
    queuedUsers.add(userId);

    await interaction.editReply({
      content:
        "⏳ **طلبك في قائمة الانتظار**\n\n" +
        `📦 النوع: **${getCategory(type).label}**\n\n` +
        "لن يظهر طلبك للكل. ننتظر شخصًا آخر يختار النوع نفسه."
    });

    return;
  }

  const [partner] = waiting.splice(index, 1);

  queues.set(type, waiting);
  queuedUsers.delete(partner.userId);

  const matchId = createId();

  const match = {
    id: matchId,
    type,
    users: [partner.userId, userId],
    choices: {},
    responses: new Map([
      [partner.userId, partner.interaction],
      [userId, interaction]
    ]),
    mediatorRequested: false,
    status: "choosing",
    channelId: interaction.channelId,
    guildId: interaction.guildId
  };

  matches.set(matchId, match);
  activeUsers.add(partner.userId);
  activeUsers.add(userId);

  await Promise.all([
    updatePrivate(
      partner.interaction,
      getMatchMessage(match, partner.userId),
      choiceButtons(matchId)
    ),
    updatePrivate(
      interaction,
      getMatchMessage(match, userId),
      choiceButtons(matchId)
    )
  ]);
}

async function updateOtherPlayer(match, userId, content, components = []) {
  const otherId = match.users.find(id => id !== userId);
  const response = match.responses.get(otherId);

  if (!response) return;

  await updatePrivate(response, content, components);
}

async function handleChoice(interaction, matchId, choice) {
  const match = matches.get(matchId);

  if (!match || !match.users.includes(interaction.user.id)) {
    await interaction.reply({
      content: "❌ المطابقة غير موجودة أو انتهت.",
      ephemeral: true
    });
    return;
  }

  if (match.status !== "choosing") {
    await interaction.reply({
      content: "⚠️ تم الاتفاق على طريقة الصفقة مسبقًا.",
      ephemeral: true
    });
    return;
  }

  if (choice !== "mediated" && choice !== "direct") {
    await interaction.reply({
      content: "❌ الاختيار غير صحيح.",
      ephemeral: true
    });
    return;
  }

  const userId = interaction.user.id;
  const otherId = match.users.find(id => id !== userId);

  match.choices[userId] = choice;

  const otherChoice = match.choices[otherId];

  if (!otherChoice) {
    await interaction.update({
      content:
        `✅ اخترت **${choice === "mediated" ? "مع وسيط" : "بدون وسيط"}**.\n\n` +
        "⏳ ننتظر اختيار الطرف الثاني.",
      components: choiceButtons(matchId)
    });

    await updateOtherPlayer(
      match,
      userId,
      "⏳ الطرف الثاني ينتظر اختيارك لطريقة إتمام الصفقة.",
      choiceButtons(matchId)
    );

    return;
  }

  if (otherChoice !== choice) {
    await interaction.update({
      content:
        "⚠️ اختياراتكم مختلفة.\n\n" +
        "الطرف الثاني اختار طريقة مختلفة. غيّر اختيارك حتى تتفقون.",
      components: choiceButtons(matchId)
    });

    await updateOtherPlayer(
      match,
      userId,
      "⚠️ اختياراتكم مختلفة. اختاروا الطريقة نفسها لإكمال الصفقة.",
      choiceButtons(matchId)
    );

    return;
  }

  if (choice === "mediated") {
    match.status = "mediator";

    const content =
      "🤝 اتفقتوا على إتمام الصفقة مع وسيط!\n\n" +
      "اضغط زر **طلب وسيط** لإرسال طلبكم إلى روم الوساطة المحدد.";

    await interaction.update({
      content,
      components: mediatorButtons(matchId)
    });

    await updateOtherPlayer(
      match,
      userId,
      content,
      mediatorButtons(matchId)
    );

    return;
  }

  match.status = "completed";

  const content =
    "✅ اتفقتوا على إتمام الصفقة بدون وسيط.\n\n" +
    `👤 الطرف الثاني: <@${otherId}>\n\n` +
    "تقدرون تكملون اتفاقكم بينكم.";

  await interaction.update({
    content,
    components: []
  });

  await updateOtherPlayer(match, userId, content, []);

  await finishMatch(match);
}

async function requestMediator(interaction, matchId) {
  const match = matches.get(matchId);

  if (!match || !match.users.includes(interaction.user.id)) {
    await interaction.reply({
      content: "❌ المطابقة غير موجودة.",
      ephemeral: true
    });
    return;
  }

  if (match.status !== "mediator") {
    await interaction.reply({
      content: "❌ المطابقة ليست في مرحلة طلب الوسيط.",
      ephemeral: true
    });
    return;
  }

  if (match.mediatorRequested) {
    await interaction.reply({
      content: "✅ تم إرسال طلب الوساطة بالفعل.",
      ephemeral: true
    });
    return;
  }

  if (!mediationChannelId) {
    await interaction.reply({
      content:
        "❌ الإدارة ما حددت روم الوساطة. استخدم " +
        "/setmiddlemanchannel أولًا.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const guild = interaction.guild;

  if (!guild) {
    await interaction.editReply("❌ تعذر تحديد السيرفر.");
    return;
  }

  const channel = await guild.channels
    .fetch(mediationChannelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased() || !channel.send) {
    await interaction.editReply(
      "❌ روم الوساطة غير متاح. اطلب من الإدارة تحديد الروم من جديد."
    );
    return;
  }

  const category = getCategory(match.type);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("『 KAREN RANK ・ MIDDLEMAN REQUEST 』")
    .setDescription(
      "🤝 طلب وساطة جديد\n\n" +
      `📦 **نوع الطلب:** ${category.label}\n\n` +
      `👤 **الطرف الأول:** <@${match.users[0]}>\n` +
      `👤 **الطرف الثاني:** <@${match.users[1]}>\n\n` +
      "الحالة: ⏳ بانتظار استلام وسيط."
    )
    .setFooter({ text: `Request ID: ${match.id}` })
    .setTimestamp();

  match.mediatorRequested = true;

  try {
    const message = await channel.send({
      content: `<@&${MIDDLEMAN_ROLE_ID}>`,
      embeds: [embed],
      allowedMentions: {
        roles: [MIDDLEMAN_ROLE_ID]
      }
    });

    match.status = "completed";

    middlemanRequests.set(match.id, {
      id: match.id,
      users: [...match.users],
      type: match.type,
      channelId: channel.id,
      messageId: message.id,
      status: "pending"
    });

    await interaction.editReply(
      `✅ تم إرسال طلب الوساطة في ${channel}.`
    );

    const otherId = match.users.find(
      id => id !== interaction.user.id
    );

    const otherResponse = match.responses.get(otherId);

    if (otherResponse) {
      await updatePrivate(
        otherResponse,
        `✅ تم إرسال طلب الوساطة في ${channel}.`,
        []
      );
    }

    await finishMatch(match);
  } catch (error) {
    match.mediatorRequested = false;

    console.error("MIDDLEMAN REQUEST ERROR:", error);

    await interaction.editReply(
      "❌ تعذر إرسال طلب الوساطة. تأكد من صلاحيات البوت في الروم."
    );
  }
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "marketpanel") {
      if (!isAdmin(interaction)) {
        await interaction.reply({
          content: "❌ هذا الأمر للإدارة فقط.",
          ephemeral: true
        });
        return true;
      }

      await interaction.channel.send(createMarketPanel());

      await interaction.reply({
        content: "✅ تم إرسال لوحة مطابقة السوق.",
        ephemeral: true
      });

      return true;
    }

    if (interaction.commandName === "setmiddlemanchannel") {
      if (!isAdmin(interaction)) {
        await interaction.reply({
          content: "❌ هذا الأمر للإدارة فقط.",
          ephemeral: true
        });
        return true;
      }

      const channel = interaction.options.getChannel("channel");
      mediationChannelId = channel.id;

      await interaction.reply({
        content: `✅ تم تحديد روم الوساطة: ${channel}`,
        ephemeral: true
      });

      return true;
    }

    return false;
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== "market:select") {
      return false;
    }

    const type = interaction.values[0];

    if (!getCategory(type)) {
      await interaction.reply({
        content: "❌ نوع الطلب غير صحيح.",
        ephemeral: true
      });
      return true;
    }

    await interaction.deferReply({ ephemeral: true });
    await findMatch(interaction, type);

    return true;
  }

  if (interaction.isButton()) {
    const parts = interaction.customId.split(":");

    if (parts[0] !== "market") {
      return false;
    }

    if (parts[1] === "choice") {
      await handleChoice(interaction, parts[3], parts[2]);
      return true;
    }

    if (parts[1] === "requestmediator") {
      await requestMediator(interaction, parts[2]);
      return true;
    }
  }

  return false;
}

module.exports = {
  commands,
  handleInteraction
};
