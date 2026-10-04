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
  Routes
} = require("discord.js");

const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const DEVELOPMENT_ROLE_ID = process.env.DEVELOPMENT_ROLE_ID;

const queue = [];
const matches = new Map();
const closingMatches = new Set();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  {
    name: "setup",
    description: "Send the Karen Rank 1v1 panel"
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
      "ادخل الـQueue وخلك جاهز لمواجهة لاعب آخر.\n\n" +
      "اضغط **FIND 1V1** للبحث عن خصم."
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
        .setCustomId(`exit_${channelId}`)
        .setLabel("🔒 إغلاق الروم")
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`admin_${channelId}`)
        .setLabel("🆘 استدعاء Admin")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function removePlayerFromQueue(userId) {
  let index;

  while ((index = queue.indexOf(userId)) !== -1) {
    queue.splice(index, 1);
  }
}

function removePlayerFromMatches(userId) {
  for (const [channelId, match] of matches.entries()) {
    if (
      match.player1 === userId ||
      match.player2 === userId
    ) {
      matches.delete(channelId);
      closingMatches.delete(channelId);
    }
  }
}

function playerHasActiveMatch(guild, userId) {
  for (const [channelId, match] of matches.entries()) {
    if (
      match.player1 !== userId &&
      match.player2 !== userId
    ) {
      continue;
    }

    const channel = guild.channels.cache.get(channelId);

    if (channel) {
      return true;
    }

    matches.delete(channelId);
    closingMatches.delete(channelId);
  }

  return false;
}

async function createMatch(guild, player1, player2) {
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [
        PermissionFlagsBits.ViewChannel
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
    permissionOverwrites.push({
      id: DEVELOPMENT_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const safeName1 =
    player1.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 30) || "player1";

  const safeName2 =
    player2.username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 30) || "player2";

  const channel = await guild.channels.create({
    name: `match-${safeName1}-${safeName2}`,
    type: ChannelType.GuildText,
    permissionOverwrites
  });

  matches.set(channel.id, {
    player1: player1.id,
    player2: player2.id
  });

  const matchEmbed = new EmbedBuilder()
    .setTitle("⚔️ MATCH FOUND")
    .setDescription(
      `👤 **Player 1:** <@${player1.id}>\n` +
      `👤 **Player 2:** <@${player2.id}>\n\n` +
      "تم العثور على مباراة!\n\n" +
      "تكلموا هنا، أضيفوا بعض في Roblox، وبعدها العبوا Time Bomb 1v1."
    )
    .setFooter({
      text: "Karen Rank • Time Bomb 1v1"
    });

  const controlsEmbed = new EmbedBuilder()
    .setTitle("🎮 MATCH CONTROL")
    .setDescription(
      "استخدم الأزرار بالأسفل للتحكم بالمباراة.\n\n" +
      "🔒 **إغلاق الروم**\n" +
      "يبدأ عداد 10 ثواني ثم يتم حذف الروم.\n\n" +
      "🆘 **استدعاء Admin**\n" +
      "يستدعي رتبة Development للمساعدة."
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

client.once("ready", async () => {
  console.log(`Karen Rank online as ${client.user.tag}`);

  try {
    await registerCommands();
    console.log("Commands registered successfully.");
  } catch (error) {
    console.error("Command registration error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "setup") {
      await interaction.channel.send(mainPanel());

      await interaction.reply({
        content: "✅ تم إرسال لوحة Karen Rank.",
        ephemeral: true
      });

      return;
    }
  }

  if (!interaction.isButton()) {
    return;
  }

  if (interaction.customId === "find") {
    const userId = interaction.user.id;

    if (playerHasActiveMatch(interaction.guild, userId)) {
      return interaction.reply({
        content: "❌ أنت داخل مباراة حاليًا.",
        ephemeral: true
      });
    }

    removePlayerFromMatches(userId);
    removePlayerFromQueue(userId);

    if (queue.length === 0) {
      queue.push(userId);

      return interaction.reply({
        content: "🔎 دخلت الـQueue. انتظر لاعبًا ثانيًا.",
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
        !playerHasActiveMatch(
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
        content: "🔎 دخلت الـQueue. انتظر لاعبًا ثانيًا.",
        ephemeral: true
      });
    }

    await interaction.deferReply({
      ephemeral: true
    });

    try {
      const player1 =
        await interaction.guild.members.fetch(opponentId);

      const player2 =
        await interaction.guild.members.fetch(userId);

      const channel = await createMatch(
        interaction.guild,
        player1.user,
        player2.user
      );

      await interaction.editReply({
        content:
          `🎮 **MATCH FOUND!**\n` +
          `تم إنشاء روم المباراة: ${channel}`
      });

    } catch (error) {
      console.error("Match creation error:", error);

      queue.unshift(opponentId);

      await interaction.editReply({
        content: "❌ صار خطأ في إنشاء روم المباراة."
      });
    }

    return;
  }

  if (interaction.customId === "leave") {
    const index = queue.indexOf(interaction.user.id);

    if (index === -1) {
      return interaction.reply({
        content: "❌ أنت مو داخل الـQueue.",
        ephemeral: true
      });
    }

    queue.splice(index, 1);

    return interaction.reply({
      content: "✅ طلعت من الـQueue.",
      ephemeral: true
    });
  }

  if (interaction.customId.startsWith("exit_")) {
    const channelId =
      interaction.customId.replace("exit_", "");

    const match = matches.get(channelId);

    if (!match) {
      return interaction.reply({
        content: "❌ المباراة غير موجودة.",
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
        content: "❌ ما عندك صلاحية.",
        ephemeral: true
      });
    }

    if (closingMatches.has(channelId)) {
      return interaction.reply({
        content: "⏳ الروم بالفعل قاعد ينغلق.",
        ephemeral: true
      });
    }

    closingMatches.add(channelId);

    const player1 = match.player1;
    const player2 = match.player2;

    let seconds = 10;

    const countdownEmbed = new EmbedBuilder()
      .setTitle("🔒 MATCH CLOSING")
      .setDescription(
        `سيتم إغلاق الروم خلال **${seconds} ثواني**.`
      );

    await interaction.reply({
      embeds: [countdownEmbed]
    });

    const timer = setInterval(async () => {
      seconds--;

      if (seconds <= 0) {
        clearInterval(timer);

        matches.delete(channelId);
        closingMatches.delete(channelId);

        removePlayerFromQueue(player1);
        removePlayerFromQueue(player2);

        try {
          await interaction.channel.delete(
            "Time Bomb match closed"
          );
        } catch (error) {
          console.error(error);
        }

        return;
      }

      try {
        await interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔒 MATCH CLOSING")
              .setDescription(
                `سيتم إغلاق الروم خلال **${seconds} ثواني**.`
              )
          ]
        });
      } catch {
        clearInterval(timer);

        matches.delete(channelId);
        closingMatches.delete(channelId);

        removePlayerFromQueue(player1);
        removePlayerFromQueue(player2);
      }
    }, 1000);

    return;
  }

  if (interaction.customId.startsWith("admin_")) {
    const channelId =
      interaction.customId.replace("admin_", "");

    const match = matches.get(channelId);

    if (!match) {
      return interaction.reply({
        content: "❌ المباراة غير موجودة.",
        ephemeral: true
      });
    }

    const isPlayer =
      interaction.user.id === match.player1 ||
      interaction.user.id === match.player2;

    if (!isPlayer) {
      return interaction.reply({
        content: "❌ هذا الزر للاعبين فقط.",
        ephemeral: true
      });
    }

    if (!DEVELOPMENT_ROLE_ID) {
      return interaction.reply({
        content:
          "❌ DEVELOPMENT_ROLE_ID غير موجود في Render.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content:
        `<@&${DEVELOPMENT_ROLE_ID}> 🆘 **Admin Assistance Requested**\n\n` +
        `المباراة تحتاج مساعدة.\n` +
        `Players: <@${match.player1}> vs <@${match.player2}>`,
      allowedMentions: {
        roles: [DEVELOPMENT_ROLE_ID]
      }
    });

    return;
  }
});

client.login(TOKEN);
