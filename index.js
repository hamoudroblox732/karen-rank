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

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DEVELOPMENT_ROLE_ID = process.env.DEVELOPMENT_ROLE_ID;

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

const leaderboardFile = "./leaderboard.json";

let leaderboard = {};

if (fs.existsSync(leaderboardFile)) {
  try {
    leaderboard = JSON.parse(
      fs.readFileSync(leaderboardFile, "utf8")
    );
  } catch {
    leaderboard = {};
  }
}

function saveLeaderboard() {
  fs.writeFileSync(
    leaderboardFile,
    JSON.stringify(leaderboard, null, 2)
  );
}

function validRobloxLink(link) {
  try {
    const url = new URL(link);

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

function parseScore(input) {
  const match = input
    .trim()
    .match(/^(\d+)\s*[-:]\s*(\d+)$/);

  if (!match) {
    return null;
  }

  const player1Score = Number(match[1]);
  const player2Score = Number(match[2]);

  if (
    !Number.isInteger(player1Score) ||
    !Number.isInteger(player2Score)
  ) {
    return null;
  }

  if (player1Score === player2Score) {
    return null;
  }

  return {
    player1Score,
    player2Score
  };
}

function getLeaderboardSorted() {
  return Object.entries(leaderboard)
    .filter(([key, value]) => {
      return (
        !key.startsWith("_") &&
        value &&
        typeof value === "object" &&
        typeof value.points === "number"
      );
    })
    .sort((a, b) => {
      if (b[1].points !== a[1].points) {
        return b[1].points - a[1].points;
      }

      if (b[1].wins !== a[1].wins) {
        return b[1].wins - a[1].wins;
      }

      return a[0].localeCompare(b[0]);
    });
}

function createLeaderboardEmbed() {
  const sorted = getLeaderboardSorted();

  let description;

  if (sorted.length === 0) {
    description =
      "## 🏆 No Results Yet\n\n" +
      "No matches have been completed yet.";
  } else {
    description = sorted
      .slice(0, 25)
      .map(([userId, data], index) => {
        const position =
          index === 0
            ? "🥇"
            : index === 1
              ? "🥈"
              : index === 2
                ? "🥉"
                : `**${index + 1}.**`;

        return (
          `${position} <@${userId}>\n` +
          `> **${data.points}** Points  •  ` +
          `**${data.wins}** Wins  •  ` +
          `**${data.losses}** Losses`
        );
      })
      .join("\n\n");
  }

  return new EmbedBuilder()
    .setTitle("🏆 KAREN RANK")
    .setDescription(
      "### TIME BOMB 1V1 LEADERBOARD\n\n" +
      description
    )
    .setColor(0x5865f2)
    .setFooter({
      text: "Karen Rank • Time Bomb 1V1"
    })
    .setTimestamp();
}

function createWaitingEmbed() {
  return new EmbedBuilder()
    .setTitle("💣 KAREN RANK")
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
    .setFooter({
      text: "Karen Rank • Time Bomb 1V1"
    })
    .setTimestamp();
}

function mainPanel() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("find_1v1")
      .setLabel("FIND 1V1")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("leave_queue")
      .setLabel("LEAVE QUEUE")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [createWaitingEmbed()],
    components: [row]
  };
}

function matchControls() {
  const row = new ActionRowBuilder().addComponents(
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
  );

  return {
    components: [row]
  };
}

function createMatchEmbed(match) {
  return new EmbedBuilder()
    .setTitle("💣 TIME BOMB 1V1")
    .setDescription(
      "### ⚔️ MATCH ROOM\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `👤 **Player 1**\n<@${match.player1.id}>\n\n` +
      `👤 **Player 2**\n<@${match.player2.id}>\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🔗 اضغط **دخول القيم** لإرسال رابط السيرفر.\n\n" +
      "📢 تحتاج Admin؟ اضغط **استدعاء Admin**.\n\n" +
      "🏆 بعد انتهاء القيم استخدم:\n" +
      "`/win score:5-1`\n\n" +
      "⚠️ النتيجة تكون حسب ترتيب اللاعبين فوق."
    )
    .setColor(0x5865f2)
    .setFooter({
      text: "Karen Rank • Match Room"
    })
    .setTimestamp();
}

function createResultEmbed(
  match,
  player1Score,
  player2Score,
  winner,
  loser
) {
  return new EmbedBuilder()
    .setTitle("🏆 MATCH COMPLETED")
    .setDescription(
      "### TIME BOMB 1V1 RESULT\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `👤 **${match.player1.name}**\n` +
      `## ${player1Score}\n\n` +
      `👤 **${match.player2.name}**\n` +
      `## ${player2Score}\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `🏆 **Winner**\n<@${winner.id}>\n\n` +
      `🥈 **Opponent**\n<@${loser.id}>\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `🎯 <@${winner.id}> **+3 Points**\n` +
      `🎯 <@${loser.id}> **+1 Point**`
    )
    .setColor(0x57f287)
    .setFooter({
      text: "Karen Rank • Result Recorded"
    })
    .setTimestamp();
}

async function createMatch(player1, player2) {
  const guild = player1.guild;

  const channelName =
    `match-${player1.user.username}-${player2.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 90);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [
          PermissionsBitField.Flags.ViewChannel
        ]
      },
      {
        id: player1.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: player2.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      },
      {
        id: DEVELOPMENT_ROLE_ID,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      }
    ]
  });

  const match = {
    player1: {
      id: player1.id,
      name: player1.user.username
    },
    player2: {
      id: player2.id,
      name: player2.user.username
    }
  };

  matches.set(channel.id, match);

  await channel.send({
    content:
      `<@${player1.id}> <@${player2.id}>`,
    embeds: [createMatchEmbed(match)],
    ...matchControls()
  });

  return channel;
}

function recordResult(
  match,
  player1Score,
  player2Score
) {
  const player1Id = match.player1.id;
  const player2Id = match.player2.id;

  if (!leaderboard[player1Id]) {
    leaderboard[player1Id] = {
      points: 0,
      wins: 0,
      losses: 0
    };
  }

  if (!leaderboard[player2Id]) {
    leaderboard[player2Id] = {
      points: 0,
      wins: 0,
      losses: 0
    };
  }

  if (player1Score > player2Score) {
    leaderboard[player1Id].points += 3;
    leaderboard[player1Id].wins += 1;

    leaderboard[player2Id].points += 1;
    leaderboard[player2Id].losses += 1;
  } else {
    leaderboard[player2Id].points += 3;
    leaderboard[player2Id].wins += 1;

    leaderboard[player1Id].points += 1;
    leaderboard[player1Id].losses += 1;
  }

  saveLeaderboard();
}

async function sendNewLeaderboardEmbed() {
  if (!leaderboard._channelId) {
    return;
  }

  try {
    const channel = await client.channels.fetch(
      leaderboard._channelId
    );

    if (!channel) {
      return;
    }

    await channel.send({
      embeds: [createLeaderboardEmbed()]
    });
  } catch (error) {
    console.error(
      "LEADERBOARD SEND ERROR:",
      error
    );
  }
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription(
        "Create the Karen Rank matchmaking panel"
      ),

    new SlashCommandBuilder()
      .setName("leaderboard")
      .setDescription(
        "Set this channel as the leaderboard channel"
      ),

    new SlashCommandBuilder()
      .setName("lb")
      .setDescription(
        "Set this channel as the leaderboard channel"
      ),

    new SlashCommandBuilder()
      .setName("win")
      .setDescription(
        "Submit the result of the current match"
      )
      .addStringOption(option =>
        option
          .setName("score")
          .setDescription(
            "Enter the score, for example 5-1"
          )
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(20)
      )
  ].map(command => command.toJSON());

  await client.application.commands.set(
    commands,
    GUILD_ID
  );

  console.log("Commands registered.");
}

client.once("clientReady", async () => {
  console.log(
    `Karen Rank online as ${client.user.tag}`
  );

  try {
    await registerCommands();
  } catch (error) {
    console.error(
      "COMMAND REGISTER ERROR:",
      error
    );
  }
});

client.on(
  "interactionCreate",
  async interaction => {
    try {
      if (interaction.isChatInputCommand()) {
        if (
          interaction.commandName === "setup"
        ) {
          await interaction.reply(
            mainPanel()
          );

          return;
        }

        if (
          interaction.commandName === "leaderboard" ||
          interaction.commandName === "lb"
        ) {
          leaderboard._channelId =
            interaction.channel.id;

          saveLeaderboard();

          await interaction.reply({
            content:
              "✅ تم تعيين هذا الروم كروم الليدربورد.",
            ephemeral: true
          });

          await interaction.channel.send({
            embeds: [
              createLeaderboardEmbed()
            ]
          });

          return;
        }

        if (
          interaction.commandName === "win"
        ) {
          const match =
            matches.get(
              interaction.channel.id
            );

          if (!match) {
            await interaction.reply({
              content:
                "❌ هذا الأمر يعمل فقط داخل روم الماتش.",
              ephemeral: true
            });

            return;
          }

          const isPlayer =
            interaction.user.id ===
              match.player1.id ||
            interaction.user.id ===
              match.player2.id;

          if (!isPlayer) {
            await interaction.reply({
              content:
                "❌ فقط لاعبي الماتش يقدرون يسجلون النتيجة.",
              ephemeral: true
            });

            return;
          }

          if (
            submittedResults.has(
              interaction.channel.id
            )
          ) {
            await interaction.reply({
              content:
                "❌ تم تسجيل نتيجة هذا الماتش مسبقًا.",
              ephemeral: true
            });

            return;
          }

          const score =
            interaction.options.getString(
              "score",
              true
            );

          const parsed =
            parseScore(score);

          if (!parsed) {
            await interaction.reply({
              content:
                "❌ النتيجة غير صحيحة. اكتبها مثل `5-1`.",
              ephemeral: true
            });

            return;
          }

          submittedResults.add(
            interaction.channel.id
          );

          recordResult(
            match,
            parsed.player1Score,
            parsed.player2Score
          );

          const player1Won =
            parsed.player1Score >
            parsed.player2Score;

          const winner = player1Won
            ? match.player1
            : match.player2;

          const loser = player1Won
            ? match.player2
            : match.player1;

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
          interaction.customId ===
          "find_1v1"
        ) {
          if (
            queue.includes(
              interaction.user.id
            )
          ) {
            await interaction.reply({
              content:
                "❌ أنت موجود أصلًا في قائمة الانتظار.",
              ephemeral: true
            });

            return;
          }

          queue.push(
            interaction.user.id
          );

          await interaction.reply({
            content:
              "✅ دخلت قائمة الانتظار. انتظر خصمك.",
            ephemeral: true
          });

          if (queue.length >= 2) {
            const player1Id =
              queue.shift();

            const player2Id =
              queue.shift();

            const player1 =
              await interaction.guild.members.fetch(
                player1Id
              );

            const player2 =
              await interaction.guild.members.fetch(
                player2Id
              );

            await createMatch(
              player1,
              player2
            );
          }

          return;
        }

        if (
          interaction.customId ===
          "leave_queue"
        ) {
          const index =
            queue.indexOf(
              interaction.user.id
            );

          if (index === -1) {
            await interaction.reply({
              content:
                "❌ أنت لست في قائمة الانتظار.",
              ephemeral: true
            });

            return;
          }

          queue.splice(index, 1);

          await interaction.reply({
            content:
              "✅ خرجت من قائمة الانتظار.",
            ephemeral: true
          });

          return;
        }

        if (
          interaction.customId ===
          "game_link"
        ) {
          const channelId =
            interaction.channel.id;

          const match =
            matches.get(channelId);

          if (!match) {
            await interaction.reply({
              content:
                "❌ هذا الروم ليس روم ماتش.",
              ephemeral: true
            });

            return;
          }

          const isPlayer =
            interaction.user.id ===
              match.player1.id ||
            interaction.user.id ===
              match.player2.id;

          if (!isPlayer) {
            await interaction.reply({
              content:
                "❌ فقط لاعبي الماتش يقدرون يرسلون الرابط.",
              ephemeral: true
            });

            return;
          }

          const modal =
            new ModalBuilder()
              .setCustomId(
                `game_link_modal_${channelId}`
              )
              .setTitle(
                "دخول القيم"
              );

          const input =
            new TextInputBuilder()
              .setCustomId("link")
              .setLabel(
                "رابط دخول القيم"
              )
              .setPlaceholder(
                "https://www.roblox.com/share..."
              )
              .setStyle(
                TextInputStyle.Short
              )
              .setRequired(true)
              .setMaxLength(500);

          modal.addComponents(
            new ActionRowBuilder()
              .addComponents(input)
          );

          await interaction.showModal(
            modal
          );

          return;
        }

        if (
          interaction.customId ===
          "call_admin"
        ) {
          await interaction.reply({
            content:
              `📢 <@&${DEVELOPMENT_ROLE_ID}>`,
            allowedMentions: {
              roles: [
                DEVELOPMENT_ROLE_ID
              ]
            }
          });

          return;
        }

        if (
          interaction.customId ===
          "close_match"
        ) {
          const channelId =
            interaction.channel.id;

          if (
            closingMatches.has(
              channelId
            )
          ) {
            await interaction.reply({
              content:
                "❌ الروم قاعد ينغلق.",
              ephemeral: true
            });

            return;
          }

          closingMatches.add(
            channelId
          );

          await interaction.reply({
            content:
              "🔒 سيتم إغلاق الروم خلال 10 ثوانٍ..."
          });

          let remaining = 10;

          const timer =
            setInterval(async () => {
              remaining--;

              if (remaining <= 0) {
                clearInterval(timer);

                matches.delete(
                  channelId
                );

                submittedResults.delete(
                  channelId
                );

                closingMatches.delete(
                  channelId
                );

                try {
                  await interaction.channel.delete();
                } catch {}

                return;
              }

              try {
                await interaction.channel.send(
                  `🔒 إغلاق الروم بعد ${remaining} ثواني...`
                );
              } catch {}
            }, 1000);

          return;
        }
      }

      if (
        interaction.isModalSubmit()
      ) {
        if (
          interaction.customId.startsWith(
            "game_link_modal_"
          )
        ) {
          const channelId =
            interaction.customId.replace(
              "game_link_modal_",
              ""
            );

          const match =
            matches.get(channelId);

          if (!match) {
            await interaction.reply({
              content:
                "❌ الماتش غير موجود.",
              ephemeral: true
            });

            return;
          }

          const isPlayer =
            interaction.user.id ===
              match.player1.id ||
            interaction.user.id ===
              match.player2.id;

          if (!isPlayer) {
            await interaction.reply({
              content:
                "❌ فقط لاعبي الماتش يقدرون يرسلون الرابط.",
              ephemeral: true
            });

            return;
          }

          const link =
            interaction.fields.getTextInputValue(
              "link"
            );

          if (
            !validRobloxLink(link)
          ) {
            await interaction.reply({
              content:
                "❌ حط رابط Roblox صحيح.",
              ephemeral: true
            });

            return;
          }

          await interaction.reply({
            content:
              "✅ تم إرسال رابط القيم."
          });

          await interaction.channel.send(
            link
          );

          return;
        }
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
  }
);

client.login(TOKEN);
