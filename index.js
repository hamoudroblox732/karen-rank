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

const queue = [];
const matches = new Map();

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

function panel() {
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

async function createMatch(guild, player1, player2) {
  const channel = await guild.channels.create({
    name: `match-${player1.username}-${player2.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 90),

    type: ChannelType.GuildText,

    permissionOverwrites: [
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
    ]
  });

  matches.set(channel.id, {
    player1: player1.id,
    player2: player2.id
  });

  const embed = new EmbedBuilder()
    .setTitle("⚔️ MATCH FOUND")
    .setDescription(
      `👤 **Player 1:** <@${player1.id}>\n` +
      `👤 **Player 2:** <@${player2.id}>\n\n` +
      "تم إنشاء روم خاص لكم.\n" +
      "تكلموا هنا، أضيفوا بعض في Roblox، وبعدها العبوا Time Bomb 1v1."
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`close_${channel.id}`)
      .setLabel("CLOSE ROOM")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`report_${channel.id}`)
      .setLabel("REPORT")
      .setStyle(ButtonStyle.Secondary)
  );

  await channel.send({
    content: `<@${player1.id}> <@${player2.id}>`,
    embeds: [embed],
    components: [row]
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
      await interaction.channel.send(panel());

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

    if (queue.includes(userId)) {
      return interaction.reply({
        content: "⏳ أنت بالفعل في الـQueue.",
        ephemeral: true
      });
    }

    for (const match of matches.values()) {
      if (
        match.player1 === userId ||
        match.player2 === userId
      ) {
        return interaction.reply({
          content: "❌ أنت داخل مباراة حاليًا.",
          ephemeral: true
        });
      }
    }

    if (queue.length === 0) {
      queue.push(userId);

      return interaction.reply({
        content: "🔎 دخلت الـQueue. انتظر لاعبًا ثانيًا.",
        ephemeral: true
      });
    }

    const opponentId = queue.shift();

    await interaction.deferReply({
      ephemeral: true
    });

    try {
      const opponent = await interaction.guild.members.fetch(opponentId);
      const player = await interaction.guild.members.fetch(userId);

      const channel = await createMatch(
        interaction.guild,
        opponent.user,
        player.user
      );

      await interaction.editReply({
        content: `🎮 تم العثور على خصم!\n${channel}`
      });
    } catch (error) {
      queue.unshift(opponentId);

      console.error(error);

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

  if (interaction.customId.startsWith("close_")) {
    const channelId = interaction.customId.replace("close_", "");
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
        content: "❌ ما عندك صلاحية تقفل هذا الروم.",
        ephemeral: true
      });
    }

    matches.delete(channelId);

    await interaction.reply("🔒 سيتم إغلاق الروم...");

    setTimeout(async () => {
      try {
        await interaction.channel.delete();
      } catch {}
    }, 1500);

    return;
  }

  if (interaction.customId.startsWith("report_")) {
    return interaction.reply({
      content:
        "🚨 تم إرسال البلاغ للإدارة.\n" +
        "تقدر تشرح المشكلة هنا داخل الروم.",
      ephemeral: true
    });
  }
});

client.login(TOKEN);
