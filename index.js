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

function cleanupPlayer(playerId) {
  const queueIndex = queue.indexOf(playerId);

  if (queueIndex !== -1) {
    queue.splice(queueIndex, 1);
  }

  for (const [channelId, match] of matches.entries()) {
    if (
      match.player1 === playerId ||
      match.player2 === playerId
    ) {
      matches.delete(channelId);
      closingMatches.delete(channelId);
    }
  }
}

function isPlayerInActiveMatch(guild, playerId) {
  for (const [channelId, match] of matches.entries()) {
    if (
      match.player1 !== playerId &&
      match.player2 !== playerId
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
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`exit_${channelId}`)
      .setLabel("🚪 خروج من الماتش")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`admin_${channelId}`)
      .setLabel("🆘 استدعاء Admin")
      .setStyle(ButtonStyle.Secondary)
  );

  return [row];
}

async function createMatch(guild, player1, player2) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
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
    overwrites.push({
      id: DEVELOPMENT_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `match-${player1.username}-${player2.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 90),

    type: ChannelType.GuildText,

    permissionOverwrites: overwrites
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
      "تم إنشاء روم خاص لكم.\n" +
      "تكلموا هنا، أضيفوا بعض في Roblox، وبعدها العبوا Time Bomb 1v1."
    )
    .setFooter({
      text: "Karen Rank • Time Bomb 1v1"
    });

  const controlEmbed = new EmbedBuilder()
    .setTitle("🎮 MATCH CONTROLS")
    .setDescription(
      "**🚪 خروج من الماتش**\n" +
      "إذا ضغطت عليه، يبدأ عداد 10 ثواني وبعدها يتم إغلاق الروم للجميع.\n\n" +
      "**🆘 استدعاء Admin**\n" +
      "يستدعي فريق الـDevelopment للمساعدة داخل الروم."
    );

  await channel.send({
    content: `<@${player1.id}> <@${player2.id}>`,
    embeds: [matchEmbed]
  });

  await channel.send({
    embeds: [controlEmbed],
    components: matchControls(channel.id)
  });

  return channel;
}

client.once("ready", async () => {
  console.log(`Karen Rank online as ${client.user.tag}`);

  try {
    await registerCommands();
    console.log("Commands registered.");
  } catch (error) {
    console.error(error);
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

  if (!interaction.isButton()) return;

  if (interaction.customId === "find") {
    const userId = interaction.user.id;

    if (isPlayerInActiveMatch(interaction.guild, userId)) {
      return interaction.reply({
        content: "❌ أنت داخل مباراة حاليًا.",
        ephemeral: true
      });
    }

    cleanupPlayer(userId);

    if (queue.includes(userId)) {
      return interaction.reply({
        content: "⏳ أنت بالفعل في الـQueue.",
        ephemeral: true
      });
    }

    if (queue.length === 0) {
      queue.push(userId);

      return interaction.reply({
        content: "🔎 دخلت الـQueue. انتظر لاعبًا ثانيًا.",
        ephemeral: true
      });
    }

    let opponentId = null;

    while (queue.length > 0) {
      const possibleOpponent = queue.shift();

      if (possibleOpponent === userId) {
        continue;
      }

      if (
        !isPlayerInActiveMatch(
          interaction.guild,
          possibleOpponent
        )
      ) {
        opponentId = possibleOpponent;
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
      const opponent = await interaction.guild.members.fetch(
        opponentId
      );

      const player = await interaction.guild.members.fetch(
        userId
      );

      const channel = await createMatch(
        interaction.guild,
        opponent.user,
        player.user
      );

      await interaction.editReply({
        content: `🎮 تم العثور على خصم!\n${channel}`
      });
    } catch (error) {
      console.error(error);

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
    const channelId = interaction.customId.replace("exit_", "");
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

    const isStaff =
      interaction.memberPermissions?.has(
        PermissionFlagsBits.Administrator
      );

    if (!isPlayer && !isStaff) {
      return interaction.reply({
        content: "❌ ما عندك صلاحية.",
        ephemeral: true
      });
    }

    if (closingMatches.has(channelId)) {
      return interaction.reply({
        content: "⏳ الروم بالفعل في مرحلة الإغلاق.",
        ephemeral: true
      });
    }

    closingMatches.add(channelId);

    const player1 = match.player1;
    const player2 = match.player2;

    const countdownEmbed = new EmbedBuilder()
      .setTitle("🚪 MATCH CLOSING")
      .setDescription(
        "تم طلب الخروج من الماتش.\n\n" +
        "🔒 سيتم إغلاق هذا الروم خلال **10 ثواني**."
      );

    await interaction.reply({
      embeds: [countdownEmbed]
    });

    let seconds = 10;

    const countdown = setInterval(async () => {
      seconds--;

      if (seconds <= 0) {
        clearInterval(countdown);

        matches.delete(channelId);
        closingMatches.delete(channelId);

        cleanupPlayer(player1);
        cleanupPlayer(player2);

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
              .setTitle("🚪 MATCH CLOSING")
              .setDescription(
                "تم طلب الخروج من الماتش.\n\n" +
                `🔒 سيتم إغلاق هذا الروم خلال **${seconds} ثواني**.`
              )
          ]
        });
      } catch {
        clearInterval(countdown);

        matches.delete(channelId);
        closingMatches.delete(channelId);

        cleanupPlayer(player1);
        cleanupPlayer(player2);
      }
    }, 1000);

    return;
  }

  if (interaction.customId.startsWith("admin_")) {
    const channelId = interaction.customId.replace("admin_", "");
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
        content: "❌ لم يتم إعداد DEVELOPMENT_ROLE_ID في Render.",
        ephemeral: true
      });
    }

    await interaction.reply({
      content:
        `<@&${DEVELOPMENT_ROLE_ID}> 🆘 **Admin Assistance Requested**\n` +
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
