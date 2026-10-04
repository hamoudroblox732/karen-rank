const {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  REST,
  Routes,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

const fs = require("fs");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DEVELOPMENT_ROLE_ID = process.env.DEVELOPMENT_ROLE_ID;

const queue = [];
const matches = new Map();
const closingMatches = new Set();

let leaderboard = {};
let leaderboardChannelId = null;
let leaderboardMessageId = null;

if (fs.existsSync("leaderboard.json")) {
  try {
    const data = JSON.parse(
      fs.readFileSync("leaderboard.json", "utf8")
    );

    leaderboard = data.leaderboard || {};
    leaderboardChannelId = data.channelId || null;
    leaderboardMessageId = data.messageId || null;
  } catch {
    leaderboard = {};
  }
}

function saveLeaderboard() {
  fs.writeFileSync(
    "leaderboard.json",
    JSON.stringify(
      {
        leaderboard,
        channelId: leaderboardChannelId,
        messageId: leaderboardMessageId
      },
      null,
      2
    )
  );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const commands = [
  {
    name: "setup",
    description: "Send the Karen Rank 1v1 panel"
  },
  {
    name: "leaderboard",
    description: "Create the Karen Rank leaderboard"
  },
  {
    name: "lb",
    description: "Create the Karen Rank leaderboard"
  }
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    {
      body: commands
    }
  );
}

function mainPanel() {
  const embed = new EmbedBuilder()
    .setTitle("KAREN RANK")
    .setDescription(
      "🎮 **TIME BOMB 1V1**\n\n" +
      "ما عندك أحد تلعب معه؟\n" +
      "ادخل الـQueue وابحث عن خصم.\n\n" +
      "اضغط **FIND 1V1** للبدء."
    )
    .addFields({
      name: "Players Waiting",
      value: `**${queue.length}**`,
      inline: false
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("find")
      .setLabel("FIND 1V1")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("leave")
      .setLabel("LEAVE QUEUE")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row]
  };
}

function matchControls(channelId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`game_${channelId}`)
        .setLabel("🔗 دخول القيم")
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`result_${channelId}`)
        .setLabel("🏆 إرسال النتيجة")
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`admin_${channelId}`)
        .setLabel("استدعاء Admin")
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`exit_${channelId}`)
        .setLabel("🔒 إغلاق الروم")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function removeFromQueue(userId) {
  let index;

  while ((index = queue.indexOf(userId)) !== -1) {
    queue.splice(index, 1);
  }
}

function getActiveMatch(guild, userId) {
  for (const [channelId, match] of matches.entries()) {
    if (
      match.player1 !== userId &&
      match.player2 !== userId
    ) {
      continue;
    }

    const channel = guild.channels.cache.get(channelId);

    if (channel) {
      return {
        channelId,
        match
      };
    }

    matches.delete(channelId);
    closingMatches.delete(channelId);
  }

  return null;
}

async function createMatch(guild, player1, player2) {
  const permissions = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
      ]
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels
      ]
    },
    {
      id: player1.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    },
    {
      id: player2.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  if (DEVELOPMENT_ROLE_ID) {
    permissions.push({
      id: DEVELOPMENT_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const name1 =
    player1.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 25) || "player1";

  const name2 =
    player2.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 25) || "player2";

  const channel = await guild.channels.create({
    name: `match-${name1}-${name2}`,
    type: ChannelType.GuildText,
    permissionOverwrites: permissions
  });

  matches.set(channel.id, {
    player1: player1.id,
    player2: player2.id,
    player1Name: player1.username,
    player2Name: player2.username,
    resultSubmitted: false
  });

  const matchEmbed = new EmbedBuilder()
    .setTitle("⚔️ MATCH FOUND")
    .setDescription(
      `👤 **Player 1:** <@${player1.id}>\n` +
      `👤 **Player 2:** <@${player2.id}>\n\n` +
      "تم العثور على خصم.\n" +
      "العبوا الـ1v1 ثم أرسلوا النتيجة.\n\n" +
      "**مهم:** النتيجة تكون حسب الترتيب التالي:\n" +
      `Player 1 **${player1.username}** - Player 2 **${player2.username}**`
    )
    .setFooter({
      text: "Karen Rank • Time Bomb 1v1"
    });

  const controlsEmbed = new EmbedBuilder()
    .setTitle("🎮 MATCH CONTROL")
    .setDescription(
      "**🔗 دخول القيم**\n" +
      "اضغط الزر وأرسل رابط Roblox.\n" +
      "البوت سيرسل الرابط كنص عادي داخل الروم.\n\n" +

      "**🏆 إرسال النتيجة**\n" +
      "اضغط الزر وأدخل نتيجة Player 1 وPlayer 2.\n\n" +

      "**استدعاء Admin**\n" +
      "استدعاء فريق Development.\n\n" +

      "**🔒 إغلاق الروم**\n" +
      "إغلاق المباراة بعد عداد 10 ثواني."
    )
    .setFooter({
      text: "Karen Rank"
    });

  await channel.send({
    content: `<@${player1.id}> <@${player2.id}>`,
    embeds: [matchEmbed],
    allowedMentions: {
      users: [player1.id, player2.id]
    }
  });

  await channel.send({
    embeds: [controlsEmbed],
    components: matchControls(channel.id)
  });

  return channel;
}

function validRobloxLink(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      (
        url.hostname === "roblox.com" ||
        url.hostname.endsWith(".roblox.com")
      )
    );
  } catch {
    return false;
  }
}

function parseScore(value) {
  const match = value
    .trim()
    .match(/^(\d+)\s*[-:]\s*(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    player1Score: Number(match[1]),
    player2Score: Number(match[2])
  };
}

function getLeaderboardText() {
  const entries = Object.entries(leaderboard);

  if (entries.length === 0) {
    return "لا توجد نتائج مسجلة حتى الآن.";
  }

  entries.sort((a, b) => {
    return (
      b[1].wins - a[1].wins ||
      b[1].points - a[1].points
    );
  });

  return entries
    .slice(0, 10)
    .map(([id, data], index) => {
      return (
        `**${index + 1}.** <@${id}> — ` +
        `🏆 **${data.wins} Wins** • ` +
        `❌ ${data.losses} Losses • ` +
        `⭐ ${data.points} Points`
      );
    })
    .join("\n");
}

async function updateLeaderboard() {
  if (!leaderboardChannelId) {
    return;
  }

  const channel =
    client.channels.cache.get(leaderboardChannelId);

  if (!channel) {
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("🏆 KAREN RANK LEADERBOARD")
    .setDescription(getLeaderboardText())
    .setFooter({
      text: "Karen Rank • Time Bomb 1v1"
    });

  let message = null;

  if (leaderboardMessageId) {
    try {
      message = await channel.messages.fetch(
        leaderboardMessageId
      );
    } catch {
      message = null;
    }
  }

  if (message) {
    await message.edit({
      embeds: [embed]
    });
  } else {
    const newMessage = await channel.send({
      embeds: [embed]
    });

    leaderboardMessageId = newMessage.id;
    saveLeaderboard();
  }
}

async function recordResult(
  channel,
  match,
  player1Score,
  player2Score
) {
  if (match.resultSubmitted) {
    return false;
  }

  if (player1Score === player2Score) {
    return false;
  }

  match.resultSubmitted = true;

  const winnerId =
    player1Score > player2Score
      ? match.player1
      : match.player2;

  const loserId =
    winnerId === match.player1
      ? match.player2
      : match.player1;

  if (!leaderboard[match.player1]) {
    leaderboard[match.player1] = {
      wins: 0,
      losses: 0,
      points: 0
    };
  }

  if (!leaderboard[match.player2]) {
    leaderboard[match.player2] = {
      wins: 0,
      losses: 0,
      points: 0
    };
  }

  leaderboard[winnerId].wins += 1;
  leaderboard[winnerId].points += 3;

  leaderboard[loserId].losses += 1;
  leaderboard[loserId].points += 1;

  saveLeaderboard();

  const resultEmbed = new EmbedBuilder()
    .setTitle("🏆 MATCH RESULT")
    .setDescription(
      `👤 **Player 1 — ${match.player1Name}:** ${player1Score}\n` +
      `👤 **Player 2 — ${match.player2Name}:** ${player2Score}\n\n` +
      `🥇 **Winner:** <@${winnerId}>\n` +
      `❌ **Loser:** <@${loserId}>\n\n` +
      `🏆 <@${winnerId}> حصل على **3 نقاط**\n` +
      `⭐ <@${loserId}> حصل على **1 نقطة**`
    )
    .setFooter({
      text: "Karen Rank • Result Recorded"
    });

  await channel.send({
    content:
      `<@${match.player1}> <@${match.player2}>`,
    embeds: [resultEmbed],
    allowedMentions: {
      users: [
        match.player1,
        match.player2
      ]
    }
  });

  await updateLeaderboard();

  return true;
}

client.once("ready", async () => {
  console.log(
    `Karen Rank online as ${client.user.tag}`
  );

  try {
    await registerCommands();
    console.log("Commands registered.");
  } catch (error) {
    console.error(
      "Command registration error:",
      error
    );
  }

  try {
    await updateLeaderboard();
  } catch (error) {
    console.error(
      "Leaderboard update error:",
      error
    );
  }
});

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup") {
        await interaction.channel.send(
          mainPanel()
        );

        await interaction.reply({
          content:
            "✅ تم إرسال لوحة Karen Rank.",
          ephemeral: true
        });

        return;
      }

      if (
        interaction.commandName === "leaderboard" ||
        interaction.commandName === "lb"
      ) {
        leaderboardChannelId =
          interaction.channel.id;

        leaderboardMessageId = null;

        saveLeaderboard();

        await updateLeaderboard();

        await interaction.reply({
          content:
            "✅ تم تفعيل الـLeaderboard في هذا الروم. أي نتيجة جديدة ستتحدث هنا تلقائيًا.",
          ephemeral: true
        });

        return;
      }
    }

    if (
      !interaction.isButton() &&
      !interaction.isModalSubmit()
    ) {
      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId === "find"
    ) {
      const userId = interaction.user.id;

      const activeMatch = getActiveMatch(
        interaction.guild,
        userId
      );

      if (activeMatch) {
        return interaction.reply({
          content:
            "❌ أنت داخل مباراة حاليًا.",
          ephemeral: true
        });
      }

      removeFromQueue(userId);

      if (queue.length === 0) {
        queue.push(userId);

        return interaction.reply({
          content:
            "🔎 دخلت الـQueue. انتظر لاعبًا ثانيًا.",
          ephemeral: true
        });
      }

      let opponentId = null;

      while (queue.length > 0) {
        const candidate = queue.shift();

        if (candidate === userId) {
          continue;
        }

        if (
          !getActiveMatch(
            interaction.guild,
            candidate
          )
        ) {
          opponentId = candidate;
          break;
        }
      }

      if (!opponentId) {
        queue.push(userId);

        return interaction.reply({
          content:
            "🔎 دخلت الـQueue. انتظر لاعبًا ثانيًا.",
          ephemeral: true
        });
      }

      await interaction.deferReply({
        ephemeral: true
      });

      try {
        const opponent =
          await interaction.guild.members.fetch(
            opponentId
          );

        const player =
          await interaction.guild.members.fetch(
            userId
          );

        const channel = await createMatch(
          interaction.guild,
          opponent.user,
          player.user
        );

        await interaction.editReply({
          content:
            `🎮 **MATCH FOUND!**\n${channel}`
        });
      } catch (error) {
        console.error(
          "MATCH ERROR:",
          error
        );

        queue.unshift(opponentId);

        await interaction.editReply({
          content:
            "❌ حدث خطأ في إنشاء المباراة."
        });
      }

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId === "leave"
    ) {
      const index = queue.indexOf(
        interaction.user.id
      );

      if (index === -1) {
        return interaction.reply({
          content:
            "❌ أنت مو داخل الـQueue.",
          ephemeral: true
        });
      }

      queue.splice(index, 1);

      return interaction.reply({
        content:
          "✅ طلعت من الـQueue.",
        ephemeral: true
      });
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith("game_")
    ) {
      const channelId =
        interaction.customId.replace(
          "game_",
          ""
        );

      const match = matches.get(channelId);

      if (!match) {
        return interaction.reply({
          content:
            "❌ المباراة غير موجودة.",
          ephemeral: true
        });
      }

      const isPlayer =
        interaction.user.id === match.player1 ||
        interaction.user.id === match.player2;

      if (!isPlayer) {
        return interaction.reply({
          content:
            "❌ هذا الزر للاعبين فقط.",
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(
          `game_modal_${channelId}`
        )
        .setTitle("دخول القيم");

      const linkInput =
        new TextInputBuilder()
          .setCustomId("game_link")
          .setLabel("رابط دخول القيم")
          .setPlaceholder(
            "الصق رابط Roblox هنا"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMaxLength(500);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          linkInput
        )
      );

      await interaction.showModal(modal);

      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith(
        "game_modal_"
      )
    ) {
      const channelId =
        interaction.customId.replace(
          "game_modal_",
          ""
        );

      const match =
        matches.get(channelId);

      if (!match) {
        return interaction.reply({
          content:
            "❌ المباراة غير موجودة.",
          ephemeral: true
        });
      }

      const link =
        interaction.fields
          .getTextInputValue(
            "game_link"
          )
          .trim();

      if (!validRobloxLink(link)) {
        return interaction.reply({
          content:
            "❌ الرابط غير صالح. استخدم رابط Roblox صحيح.",
          ephemeral: true
        });
      }

      await interaction.reply({
        content:
          "✅ تم إرسال الرابط داخل الروم.",
        ephemeral: true
      });

      await interaction.channel.send({
        content:
          `🔗 **رابط القيم من <@${interaction.user.id}>:**\n${link}`,
        allowedMentions: {
          users: [interaction.user.id]
        }
      });

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "result_"
      )
    ) {
      const channelId =
        interaction.customId.replace(
          "result_",
          ""
        );

      const match =
        matches.get(channelId);

      if (!match) {
        return interaction.reply({
          content:
            "❌ المباراة غير موجودة.",
          ephemeral: true
        });
      }

      const isPlayer =
        interaction.user.id === match.player1 ||
        interaction.user.id === match.player2;

      if (!isPlayer) {
        return interaction.reply({
          content:
            "❌ هذا الزر للاعبين فقط.",
          ephemeral: true
        });
      }

      if (match.resultSubmitted) {
        return interaction.reply({
          content:
            "❌ تم تسجيل نتيجة هذه المباراة مسبقًا.",
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(
          `result_modal_${channelId}`
        )
        .setTitle("إرسال نتيجة المباراة");

      const scoreInput =
        new TextInputBuilder()
          .setCustomId("score")
          .setLabel("Player 1 Score - Player 2 Score")
          .setPlaceholder(
            "مثال: 5-2"
          )
          .setStyle(
            TextInputStyle.Short
          )
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(20);

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          scoreInput
        )
      );

      await interaction.showModal(modal);

      return;
    }

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith(
        "result_modal_"
      )
    ) {
      const channelId =
        interaction.customId.replace(
          "result_modal_",
          ""
        );

      const match =
        matches.get(channelId);

      if (!match) {
        return interaction.reply({
          content:
            "❌ المباراة غير موجودة.",
          ephemeral: true
        });
      }

      const isPlayer =
        interaction.user.id === match.player1 ||
        interaction.user.id === match.player2;

      if (!isPlayer) {
        return interaction.reply({
          content:
            "❌ هذا الزر للاعبين فقط.",
          ephemeral: true
        });
      }

      if (match.resultSubmitted) {
        return interaction.reply({
          content:
            "❌ تم تسجيل نتيجة هذه المباراة مسبقًا.",
          ephemeral: true
        });
      }

      const value =
        interaction.fields.getTextInputValue(
          "score"
        );

      const score = parseScore(value);

      if (!score) {
        return interaction.reply({
          content:
            "❌ النتيجة غير صحيحة. اكتبها مثل `5-2` أو `5:2`.",
          ephemeral: true
        });
      }

      if (
        score.player1Score ===
        score.player2Score
      ) {
        return interaction.reply({
          content:
            "❌ التعادل غير مسموح.",
          ephemeral: true
        });
      }

      await interaction.reply({
        content:
          "⏳ جاري تسجيل النتيجة...",
        ephemeral: true
      });

      try {
        const recorded = await recordResult(
          interaction.channel,
          match,
          score.player1Score,
          score.player2Score
        );

        if (recorded) {
          await interaction.editReply({
            content:
              "✅ تم تسجيل النتيجة وتحديث الـLeaderboard."
          });
        } else {
          match.resultSubmitted = false;

          await interaction.editReply({
            content:
              "❌ لم يتم تسجيل النتيجة."
          });
        }
      } catch (error) {
        console.error(
          "RESULT ERROR:",
          error
        );

        match.resultSubmitted = false;

        await interaction.editReply({
          content:
            "❌ حدث خطأ أثناء تسجيل النتيجة."
        });
      }

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "admin_"
      )
    ) {
      const channelId =
        interaction.customId.replace(
          "admin_",
          ""
        );

      const match =
        matches.get(channelId);

      if (!match) {
        return interaction.reply({
          content:
            "❌ المباراة غير موجودة.",
          ephemeral: true
        });
      }

      const isPlayer =
        interaction.user.id === match.player1 ||
        interaction.user.id === match.player2;

      if (!isPlayer) {
        return interaction.reply({
          content:
            "❌ هذا الزر للاعبين فقط.",
          ephemeral: true
        });
      }

      if (!DEVELOPMENT_ROLE_ID) {
        return interaction.reply({
          content:
            "❌ DEVELOPMENT_ROLE_ID غير موجود في الاستضافة.",
          ephemeral: true
        });
      }

      await interaction.reply({
        content:
          `<@&${DEVELOPMENT_ROLE_ID}> **Admin Requested**\n\n` +
          `Players: <@${match.player1}> vs <@${match.player2}>`,
        allowedMentions: {
          roles: [
            DEVELOPMENT_ROLE_ID
          ]
        }
      });

      return;
    }

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "exit_"
      )
    ) {
      const channelId =
        interaction.customId.replace(
          "exit_",
          ""
        );

      const match =
        matches.get(channelId);

      if (!match) {
        return interaction.reply({
          content:
            "❌ المباراة غير موجودة.",
          ephemeral: true
        });
      }

      const isPlayer =
        interaction.user.id === match.player1 ||
        interaction.user.id === match.player2;

      const isAdmin =
        interaction.memberPermissions?.has(
          PermissionFlagsBits.Administrator
        );

      if (!isPlayer && !isAdmin) {
        return interaction.reply({
          content:
            "❌ ما عندك صلاحية.",
          ephemeral: true
        });
      }

      if (
        closingMatches.has(channelId)
      ) {
        return interaction.reply({
          content:
            "⏳ الروم بالفعل قاعد ينغلق.",
          ephemeral: true
        });
      }

      closingMatches.add(channelId);

      const player1 = match.player1;
      const player2 = match.player2;

      let seconds = 10;

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(
              "🔒 MATCH CLOSING"
            )
            .setDescription(
              `سيتم إغلاق الروم خلال **${seconds} ثواني**.`
            )
        ]
      });

      const timer = setInterval(
        async () => {
          seconds--;

          if (seconds <= 0) {
            clearInterval(timer);

            matches.delete(channelId);
            closingMatches.delete(channelId);

            removeFromQueue(player1);
            removeFromQueue(player2);

            try {
              await interaction.channel.delete(
                "Time Bomb match closed"
              );
            } catch {}

            return;
          }

          try {
            await interaction.editReply({
              embeds: [
                new EmbedBuilder()
                  .setTitle(
                    "🔒 MATCH CLOSING"
                  )
                  .setDescription(
                    `سيتم إغلاق الروم خلال **${seconds} ثواني**.`
                  )
              ]
            });
          } catch {
            clearInterval(timer);
          }
        },
        1000
      );

      return;
    }
  } catch (error) {
    console.error(
      "INTERACTION ERROR:",
      error
    );

    if (
      !interaction.replied &&
      !interaction.deferred
    ) {
      try {
        await interaction.reply({
          content:
            "❌ حدث خطأ غير متوقع.",
          ephemeral: true
        });
      } catch {}
    }
  }
});

client.on("error", error => {
  console.error(
    "DISCORD CLIENT ERROR:",
    error
  );
});

process.on("unhandledRejection", error => {
  console.error(
    "UNHANDLED REJECTION:",
    error
  );
});

process.on("uncaughtException", error => {
  console.error(
    "UNCAUGHT EXCEPTION:",
    error
  );
});

client.login(TOKEN);
