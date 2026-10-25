const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  SlashCommandBuilder
} = require("discord.js");
const fs = require("fs");
const moderation = require("./moderation.js");
const market = require("./market.js");
const TOKEN = process.env.TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DEVELOPMENT_ROLE_ID = process.env.DEVELOPMENT_ROLE_ID;
if (!TOKEN) throw new Error("Missing TOKEN environment variable.");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});
const queue = [];
const matches = new Map();
const closingMatches = new Set();
const submittedResults = new Set();
const closingMessageCleanup = new Set();
const leaderboardFile = "./leaderboard.json";
let leaderboard = {};
if (fs.existsSync(leaderboardFile)) {
  try {
    leaderboard = JSON.parse(fs.readFileSync(leaderboardFile, "utf8"));
  } catch (error) {
    console.error("LEADERBOARD LOAD ERROR:", error);
    leaderboard = {};
  }
}
function saveLeaderboard() {
  fs.writeFileSync(leaderboardFile, JSON.stringify(leaderboard, null, 2));
}
function isOwner(interaction) {
  return Boolean(
    interaction.guild &&
    interaction.user.id === interaction.guild.ownerId
  );
}
function validRobloxLink(link) {
  try {
    const url = new URL(link);
    return url.protocol === "https:" &&
      (url.hostname === "roblox.com" || url.hostname.endsWith(".roblox.com"));
  } catch {
    return false;
  }
}
function parseScore(input) {
  const result = input.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!result) return null;
  const player1Score = Number(result[1]);
  const player2Score = Number(result[2]);
  if (
    !Number.isSafeInteger(player1Score) ||
    !Number.isSafeInteger(player2Score) ||
    player1Score === player2Score
  ) return null;
  return { player1Score, player2Score };
}
function ensurePlayer(userId) {
  if (!leaderboard[userId]) {
    leaderboard[userId] = {
      points: 0,
      wins: 0,
      losses: 0,
      roundsWon: 0,
      roundsLost: 0
    };
  }
  const player = leaderboard[userId];
  if (typeof player.points !== "number") player.points = 0;
  if (typeof player.wins !== "number") player.wins = 0;
  if (typeof player.losses !== "number") player.losses = 0;
  if (typeof player.roundsWon !== "number") player.roundsWon = 0;
  if (typeof player.roundsLost !== "number") player.roundsLost = 0;
  return player;
}
function getLeaderboardSorted() {
  return Object.entries(leaderboard)
    .filter(([key, value]) =>
      !key.startsWith("_") &&
      value &&
      typeof value === "object" &&
      typeof value.points === "number"
    )
    .sort((a, b) =>
      b[1].points - a[1].points ||
      b[1].wins - a[1].wins ||
      b[1].roundsWon - a[1].roundsWon ||
      a[0].localeCompare(b[0])
    );
}
function createLeaderboardEmbed() {
  const sorted = getLeaderboardSorted();
  const description = sorted.length === 0
    ? "## No Results Yet\n\nNo matches have been completed yet."
    : sorted.slice(0, 25).map(([userId, data], index) => {
        const position = ["🥇", "🥈", "🥉"][index] || `**${index + 1}.**`;
        return (
          `${position} <@${userId}>\n` +
          `> **${data.points}** Points • **${data.wins}** Wins • **${data.losses}** Losses\n` +
          `> **${data.roundsWon}** Rounds Won • **${data.roundsLost}** Rounds Lost`
        );
      }).join("\n\n");
  return new EmbedBuilder()
    .setTitle("KAREN RANK")
    .setDescription("### TIME BOMB 1V1 LEADERBOARD\n\n" + description)
    .setColor(0x5865f2)
    .setFooter({ text: "Karen Rank • Time Bomb 1V1" })
    .setTimestamp();
}
function createWaitingEmbed() {
  return new EmbedBuilder()
    .setTitle("KAREN RANK")
    .setDescription(
      "### TIME BOMB 1V1\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🎮 **FIND YOUR OPPONENT**\n\n" +
      "اضغط على **FIND 1V1** للدخول في قائمة الانتظار.\n\n" +
      "عند توفر لاعب آخر سيتم إنشاء روم ماتش خاص تلقائيًا.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "⚡ **Fast Matchmaking**\n" +
      "🔒 **Private Match Rooms**\n" +
      "🏆 **Ranked Results**"
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Karen Rank • Time Bomb 1V1" })
    .setTimestamp();
}
function mainPanel() {
  return {
    embeds: [createWaitingEmbed()],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("find_1v1")
          .setLabel("FIND 1V1")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("leave_queue")
          .setLabel("LEAVE QUEUE")
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}
function matchControls() {
  return {
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("game_link")
          .setLabel("🔗 دخول القيم")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("call_admin")
          .setLabel("📢 استدعاء Admin")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId("close_match")
          .setLabel("🔒 إغلاق الروم")
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}
function createMatchEmbed(match) {
  return new EmbedBuilder()
    .setTitle("TIME BOMB 1V1")
    .setDescription(
      "### ⚔️ MATCH ROOM\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `👤 **Player 1**\n<@${match.player1.id}>\n\n` +
      `👤 **Player 2**\n<@${match.player2.id}>\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🔗 اضغط **دخول القيم** لإرسال رابط السيرفر.\n\n" +
      "📢 تحتاج Admin؟ اضغط **استدعاء Admin**.\n\n" +
      "🏆 بعد انتهاء القيم استخدم `/win score:5-1`\n\n" +
      "⚠️ الرقم الأعلى هو الفائز دائمًا.\n" +
      "⚠️ اكتب النتيجة بترتيب Player 1 ثم Player 2."
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Karen Rank • Match Room" })
    .setTimestamp();
}
function createResultEmbed(match, score1, score2, winner, loser) {
  return new EmbedBuilder()
    .setTitle("MATCH COMPLETED")
    .setDescription(
      "### TIME BOMB 1V1 RESULT\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `👤 **${match.player1.name}**\n## ${score1} Rounds\n\n` +
      `👤 **${match.player2.name}**\n## ${score2} Rounds\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `🏆 **Winner**\n<@${winner.id}>\n\n` +
      `🥈 **Opponent**\n<@${loser.id}>\n\n` +
      `🎯 <@${winner.id}> **+3 Points**\n` +
      `🎯 <@${loser.id}> **+1 Point**`
    )
    .setColor(0x57f287)
    .setFooter({ text: "Karen Rank • Result Recorded" })
    .setTimestamp();
}
function createClosingEmbed(seconds) {
  return new EmbedBuilder()
    .setTitle("MATCH ROOM CLOSING")
    .setDescription(
      "### ROOM WILL BE DELETED\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `## ${seconds}\n` +
      `**${seconds === 1 ? "second" : "seconds"} remaining**\n\n` +
      "سيتم حذف روم الماتش تلقائيًا."
    )
    .setColor(0xed4245)
    .setFooter({ text: "Karen Rank • Match Room" })
    .setTimestamp();
}
async function createMatch(player1, player2) {
  const guild = player1.guild;
  const channelName =
    `match-${player1.user.username}-${player2.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 90);
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    ...[player1.id, player2.id].map(id => ({
      id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    }))
  ];
  if (DEVELOPMENT_ROLE_ID) {
    permissionOverwrites.push({
      id: DEVELOPMENT_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites
  });
  const match = {
    player1: { id: player1.id, name: player1.user.username },
    player2: { id: player2.id, name: player2.user.username }
  };
  matches.set(channel.id, match);
  await channel.send({
    content: `<@${player1.id}> <@${player2.id}>`,
    embeds: [createMatchEmbed(match)],
    ...matchControls(),
    allowedMentions: { users: [player1.id, player2.id] }
  });
  return channel;
}
function recordResult(match, score1, score2) {
  const player1 = ensurePlayer(match.player1.id);
  const player2 = ensurePlayer(match.player2.id);
  player1.roundsWon += score1;
  player1.roundsLost += score2;
  player2.roundsWon += score2;
  player2.roundsLost += score1;
  if (score1 > score2) {
    player1.points += 3;
    player1.wins += 1;
    player2.points += 1;
    player2.losses += 1;
  } else {
    player2.points += 3;
    player2.wins += 1;
    player1.points += 1;
    player1.losses += 1;
  }
  saveLeaderboard();
}
async function sendNewLeaderboardEmbed() {
  if (!leaderboard._channelId) return;
  try {
    const channel = await client.channels.fetch(leaderboard._channelId);
    if (channel?.isTextBased()) {
      await channel.send({ embeds: [createLeaderboardEmbed()] });
    }
  } catch (error) {
    console.error("LEADERBOARD SEND ERROR:", error);
  }
}
async function sendAnnouncement(interaction, channel, message, reactions) {
  const botMember = interaction.guild.members.me;
  const permissions = channel.permissionsFor(botMember);
  if (
    !permissions ||
    !permissions.has([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages
    ])
  ) {
    await interaction.reply({
      content: "❌ البوت ما عنده صلاحية الإرسال في هذا الروم.",
      ephemeral: true
    });
    return;
  }
  const sentMessage = await channel.send({
    content: message,
    allowedMentions: { parse: ["everyone"] }
  });
  for (const reaction of reactions) {
    try {
      await sentMessage.react(reaction);
    } catch (error) {
      console.error(`REACTION ERROR (${reaction}):`, error);
    }
  }
  await interaction.reply({
    content: `✅ تم إرسال الرسالة في ${channel}.`,
    ephemeral: true
  });
}
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Create the Karen Rank matchmaking panel")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("lb")
      .setDescription("Set this channel as the leaderboard channel")
      .toJSON(),
    new SlashCommandBuilder()
      .setName("win")
      .setDescription("Submit the result of the current match")
      .addStringOption(option =>
        option
          .setName("score")
          .setDescription("Enter the score, for example 5-1")
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(20)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("clear_messages")
      .setDescription("Delete recent messages in this channel (Owner only)")
      .addIntegerOption(option =>
        option
          .setName("amount")
          .setDescription("Number of recent messages to delete")
          .setRequired(true)
          .setMinValue(2)
          .setMaxValue(100)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("send")
      .setDescription("Send the fixed iPhone announcement")
      .addChannelOption(option =>
        option
          .setName("channel")
          .setDescription("الروم الذي سيتم إرسال الإعلان فيه")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("send_android")
      .setDescription("Send the Android announcement")
      .addChannelOption(option =>
        option
          .setName("channel")
          .setDescription("الروم الذي سيتم إرسال الإعلان فيه")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName("send_cus")
      .setDescription("Send a custom message with reactions")
      .addStringOption(option =>
        option
          .setName("message")
          .setDescription("الرسالة التي تريد إرسالها")
          .setRequired(true)
          .setMaxLength(2000)
      )
      .addChannelOption(option =>
        option
          .setName("channel")
          .setDescription("الروم الذي سيتم إرسال الرسالة فيه")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName("reaction1")
          .setDescription("الإيموجي الأول")
          .setRequired(true)
          .setMaxLength(100)
      )
      .addStringOption(option =>
        option
          .setName("reaction2")
          .setDescription("الإيموجي الثاني")
          .setRequired(true)
          .setMaxLength(100)
      )
      .toJSON(),
    ...moderation.commands,
    ...market.commands
  ];
  if (GUILD_ID) {
    await client.application.commands.set(commands, GUILD_ID);
  } else {
    await client.application.commands.set(commands);
  }
  console.log("Commands registered.");
}
client.once("ready", async () => {
  console.log(`Karen Rank online as ${client.user.tag}`);
  try {
    await registerCommands();
  } catch (error) {
    console.error("COMMAND REGISTER ERROR:", error);
  }
});
client.on("interactionCreate", async interaction => {
  try {
    if (await market.handleInteraction(interaction)) return;
    if (await moderation.handleInteraction(interaction)) return;
    if (interaction.isChatInputCommand()) {
      if (
        interaction.commandName === "send" ||
        interaction.commandName === "send_android" ||
        interaction.commandName === "send_cus"
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للـOwner فقط.",
            ephemeral: true
          });
          return;
        }
        const channel = interaction.options.getChannel("channel", true);
        if (!channel.isTextBased() || !channel.guild) {
          await interaction.reply({
            content: "❌ اختر روم نصي صحيح.",
            ephemeral: true
          });
          return;
        }
        if (interaction.commandName === "send") {
          const announcement =
            "# ها$ك دلتا شغال ميه بالميه للايفون\n" +
            "شغال بالكامل وباحسن طريقه\n" +
            "بأفضل جودة\n\n" +
            "شغال حط صح\n" +
            "مو شغال حط غلط\n" +
            "👇🏻\n" +
            "https://hamoudroblox732.github.io/karen-official/index.html\n\n" +
            "||@everyone@here||";
          await sendAnnouncement(
            interaction,
            channel,
            announcement,
            ["✅", "❌"]
          );
          return;
        }
        if (interaction.commandName === "send_android") {
          const announcement =
            "# ها$ك دلتا شغال ميه بالميه للاندرويد\n" +
            "شغال بالكامل وباحسن طريقه\n" +
            "👇🏻\n" +
            "https://hamoudroblox732.github.io/karen-official/index.html\n\n" +
            "شغال حط صح\n" +
            "مو شغال حط غلط\n" +
            "||@everyone@here||";
          await sendAnnouncement(
            interaction,
            channel,
            announcement,
            ["✅", "❌"]
          );
          return;
        }
        if (interaction.commandName === "send_cus") {
          const message = interaction.options.getString("message", true);
          const reaction1 = interaction.options.getString("reaction1", true);
          const reaction2 = interaction.options.getString("reaction2", true);
          await sendAnnouncement(
            interaction,
            channel,
            message,
            [reaction1, reaction2]
          );
          return;
        }
      }
      if (interaction.commandName === "clear_messages") {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للـOwner فقط.",
            ephemeral: true
          });
          return;
        }
        const amount = interaction.options.getInteger("amount", true);
        const confirmRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`clear_messages_confirm_${amount}`)
            .setLabel("تأكيد حذف الرسائل")
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId("clear_messages_cancel")
            .setLabel("إلغاء")
            .setStyle(ButtonStyle.Secondary)
        );
        await interaction.reply({
          content:
            `⚠️ هل تريد حذف ${amount} رسالة حديثة من هذا الروم؟\n` +
            "الحذف نهائي، والرسائل الأقدم من 14 يومًا لن تُحذف.",
          components: [confirmRow],
          ephemeral: true
        });
        return;
      }
      if (interaction.commandName === "setup") {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للـOwner فقط.",
            ephemeral: true
          });
          return;
        }
        await interaction.reply(mainPanel());
        return;
      }
      if (interaction.commandName === "lb") {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content: "❌ هذا الأمر للـOwner فقط.",
            ephemeral: true
          });
          return;
        }
        leaderboard._channelId = interaction.channel.id;
        saveLeaderboard();
        await interaction.reply({
          content: "✅ تم تعيين هذا الروم كروم الليدربورد.",
          ephemeral: true
        });
        await interaction.channel.send({
          embeds: [createLeaderboardEmbed()]
        });
        return;
      }
      if (interaction.commandName === "win") {
        const match = matches.get(interaction.channel.id);
        if (!match) {
          await interaction.reply({
            content: "❌ هذا الأمر يعمل فقط داخل روم الماتش.",
            ephemeral: true
          });
          return;
        }
        if (![match.player1.id, match.player2.id].includes(interaction.user.id)) {
          await interaction.reply({
            content: "❌ فقط لاعبي الماتش يقدرون يسجلون النتيجة.",
            ephemeral: true
          });
          return;
        }
        if (submittedResults.has(interaction.channel.id)) {
          await interaction.reply({
            content: "❌ تم تسجيل نتيجة هذا الماتش مسبقًا.",
            ephemeral: true
          });
          return;
        }
        const parsed = parseScore(interaction.options.getString("score", true));
        if (!parsed) {
          await interaction.reply({
            content: "❌ النتيجة غير صحيحة. اكتبها مثل `5-1`.",
            ephemeral: true
          });
          return;
        }
        submittedResults.add(interaction.channel.id);
        try {
          recordResult(match, parsed.player1Score, parsed.player2Score);
        } catch (error) {
          submittedResults.delete(interaction.channel.id);
          console.error("RESULT SAVE ERROR:", error);
          await interaction.reply({
            content: "❌ تعذر حفظ النتيجة. حاول مرة ثانية.",
            ephemeral: true
          });
          return;
        }
        const player1Won = parsed.player1Score > parsed.player2Score;
        const winner = player1Won ? match.player1 : match.player2;
        const loser = player1Won ? match.player2 : match.player1;
        await interaction.reply({
          embeds: [
            createResultEmbed(
              match,
              parsed.player1Score,
              parsed.player2Score,
              winner,
              loser
            )
          ]
        });
        await sendNewLeaderboardEmbed();
        return;
      }
    }
    if (interaction.isButton()) {
      if (
        interaction.customId === "clear_messages_cancel" ||
        interaction.customId.startsWith("clear_messages_confirm_")
      ) {
        if (!isOwner(interaction)) {
          await interaction.reply({
            content: "❌ هذا الإجراء للـOwner فقط.",
            ephemeral: true
          });
          return;
        }
        if (interaction.customId === "clear_messages_cancel") {
          await interaction.update({
            content: "✅ تم إلغاء الحذف.",
            components: []
          });
          return;
        }
        const amount = Number(
          interaction.customId.replace("clear_messages_confirm_", "")
        );
        if (
          !Number.isInteger(amount) ||
          amount < 2 ||
          amount > 100 ||
          !interaction.channel ||
          !interaction.channel.isTextBased() ||
          typeof interaction.channel.bulkDelete !== "function"
        ) {
          await interaction.update({
            content: "❌ تعذر تنفيذ الحذف في هذا الروم.",
            components: []
          });
          return;
        }
        const botMember = interaction.guild.members.me;
        if (
          !botMember ||
          !botMember.permissionsIn(interaction.channel)
            .has(PermissionsBitField.Flags.ManageMessages)
        ) {
          await interaction.update({
            content: "❌ البوت يحتاج صلاحية Manage Messages.",
            components: []
          });
          return;
        }
        await interaction.update({
          content: "⏳ جارٍ حذف الرسائل الحديثة...",
          components: []
        });
        try {
          const deleted = await interaction.channel.bulkDelete(amount, true);
          await interaction.followUp({
            content:
              `✅ تم حذف ${deleted.size} رسالة حديثة من هذا الروم.\n` +
              "الرسائل الأقدم من 14 يومًا لم تُحذف.",
            ephemeral: true
          });
        } catch (error) {
          console.error("CLEAR MESSAGES ERROR:", error);
          await interaction.followUp({
            content: "❌ تعذر حذف الرسائل. تأكد من صلاحيات البوت.",
            ephemeral: true
          });
        }
        return;
      }
      if (interaction.customId === "find_1v1") {
        if (queue.some(player => player.id === interaction.user.id)) {
          await interaction.reply({
            content: "❌ أنت موجود أصلًا في قائمة الانتظار.",
            ephemeral: true
          });
          return;
        }
        await interaction.reply({
          content: "⏳ تبحث عن خصم...",
          ephemeral: true
        });
        queue.push({
          id: interaction.user.id,
          interaction
        });
        if (queue.length >= 2) {
          const player1Queue = queue.shift();
          const player2Queue = queue.shift();
          try {
            const player1 = await interaction.guild.members.fetch(player1Queue.id);
            const player2 = await interaction.guild.members.fetch(player2Queue.id);
            const matchChannel = await createMatch(player1, player2);
            await player1Queue.interaction.editReply({
              content:
                `🎮 تم إيجاد خصمك!\n\n` +
                `👤 الخصم: <@${player2.id}>\n` +
                `📁 روم الماتش: <#${matchChannel.id}>`
            });
            await player2Queue.interaction.editReply({
              content:
                `🎮 تم إيجاد خصمك!\n\n` +
                `👤 الخصم: <@${player1.id}>\n` +
                `📁 روم الماتش: <#${matchChannel.id}>`
            });
          } catch (error) {
            console.error("MATCH CREATE ERROR:", error);
            queue.unshift(player2Queue, player1Queue);
          }
        }
        return;
      }
      if (interaction.customId === "leave_queue") {
        const index = queue.findIndex(player => player.id === interaction.user.id);
        if (index === -1) {
          await interaction.reply({
            content: "❌ أنت لست في قائمة الانتظار.",
            ephemeral: true
          });
          return;
        }
        queue.splice(index, 1);
        await interaction.reply({
          content: "✅ خرجت من قائمة الانتظار.",
          ephemeral: true
        });
        return;
      }
      if (interaction.customId === "game_link") {
        const channelId = interaction.channel.id;
        const match = matches.get(channelId);
        if (!match || ![match.player1.id, match.player2.id].includes(interaction.user.id)) {
          await interaction.reply({
            content: "❌ هذا الزر مخصص للاعبي الماتش.",
            ephemeral: true
          });
          return;
        }
        const modal = new ModalBuilder()
          .setCustomId(`game_link_modal_${channelId}`)
          .setTitle("دخول القيم");
        const input = new TextInputBuilder()
          .setCustomId("link")
          .setLabel("رابط دخول القيم")
          .setPlaceholder("https://www.roblox.com/share...")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(500);
        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );
        await interaction.showModal(modal);
        return;
      }
      if (interaction.customId === "call_admin") {
        const match = matches.get(interaction.channel.id);
        if (!match || ![match.player1.id, match.player2.id].includes(interaction.user.id)) {
          await interaction.reply({
            content: "❌ هذا الزر مخصص للاعبي الماتش.",
            ephemeral: true
          });
          return;
        }
        if (!DEVELOPMENT_ROLE_ID) {
          await interaction.reply({
            content: "❌ DEVELOPMENT_ROLE_ID غير مضبوط في إعدادات الاستضافة.",
            ephemeral: true
          });
          return;
        }
        await interaction.reply({
          content: `<@&${DEVELOPMENT_ROLE_ID}>`,
          allowedMentions: { roles: [DEVELOPMENT_ROLE_ID] }
        });
        return;
      }
      if (interaction.customId === "close_match") {
        const channelId = interaction.channel.id;
        const match = matches.get(channelId);
        if (!match) {
          await interaction.reply({
            content: "❌ هذا الروم ليس روم ماتش.",
            ephemeral: true
          });
          return;
        }
        if (
          ![match.player1.id, match.player2.id].includes(interaction.user.id) &&
          !interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)
        ) {
          await interaction.reply({
            content: "❌ ما عندك صلاحية إغلاق هذا الماتش.",
            ephemeral: true
          });
          return;
        }
        if (closingMatches.has(channelId)) {
          await interaction.reply({
            content: "❌ الروم قاعد ينغلق.",
            ephemeral: true
          });
          return;
        }
        closingMatches.add(channelId);
        let remaining = 10;
        const sentMessage = await interaction.reply({
          embeds: [createClosingEmbed(remaining)],
          fetchReply: true
        });
        const timer = setInterval(async () => {
          remaining--;
          if (remaining <= 0) {
            clearInterval(timer);
            matches.delete(channelId);
            submittedResults.delete(channelId);
            closingMatches.delete(channelId);
            try {
              await interaction.channel.delete();
            } catch (error) {
              console.error("MATCH DELETE ERROR:", error);
            }
            return;
          }
          try {
            await sentMessage.edit({
              embeds: [createClosingEmbed(remaining)]
            });
          } catch (error) {
            clearInterval(timer);
            closingMatches.delete(channelId);
            console.error("MATCH COUNTDOWN ERROR:", error);
          }
        }, 1000);
        return;
      }
    }
    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("game_link_modal_")
    ) {
      const channelId = interaction.customId.replace("game_link_modal_", "");
      const match = matches.get(channelId);
      if (!match || ![match.player1.id, match.player2.id].includes(interaction.user.id)) {
        await interaction.reply({
          content: "❌ الماتش غير موجود أو ليس لك.",
          ephemeral: true
        });
        return;
      }
      const link = interaction.fields.getTextInputValue("link");
      if (!validRobloxLink(link)) {
        await interaction.reply({
          content: "❌ حط رابط Roblox صحيح.",
          ephemeral: true
        });
        return;
      }
      await interaction.reply({
        content: "✅ تم إرسال رابط القيم.",
        ephemeral: true
      });
      await interaction.channel.send({ content: link });
    }
  } catch (error) {
    console.error("INTERACTION ERROR:", error);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: "❌ حدث خطأ غير متوقع.",
          ephemeral: true
        });
      } catch (replyError) {
        console.error("ERROR REPLY FAILED:", replyError);
      }
    }
  }
});
client.login(TOKEN);
