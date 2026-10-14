
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionsBitField
} = require("discord.js");

const MIDDLEMAN_ROLE_ID = "1559877945441648773";
const ADMIN_ROLE_ID = "1554456128472219770";
const OWNER_ROLE_ID = "1554456245329596486";

const requests = new Map();

const commands = [
  new SlashCommandBuilder()
    .setName("marketpanel")
    .setDescription("نشر لوحة السوق")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("روم نشر السوق")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("middlemanpanel")
    .setDescription("نشر لوحة طلب الوسيط")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("روم نشر لوحة الوسيط")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
].map(command => command.toJSON());

function isStaff(interaction) {
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

function hasRole(interaction, roleId) {
  return interaction.member?.roles?.cache?.has(roleId) ||
    interaction.member?.roles?.includes?.(roleId);
}

function panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("mm_request")
      .setLabel("🤝 طلب وسيط")
      .setStyle(ButtonStyle.Success)
  );
}

function marketEmbed() {
  return new EmbedBuilder()
    .setColor(0x2b2d31)
    .setTitle("🛒・سوق السيرفر")
    .setDescription(
      "ياهلا بك في سوقنا!\n" +
      "اقرأ القوانين قبل أي عملية بيع أو شراء."
    )
    .addFields(
      {
        name: "『 🎮 ・ حسابات روبلوكس 』",
        value:
          "للاستفسار عن بيع أو شراء الحسابات.\n" +
          "⚠️ تداول الحسابات قد يخالف شروط Roblox."
      },
      {
        name: "『 🧩 ・ أغراض الألعاب 』",
        value:
          "شراء الأغراض داخل ألعاب ومابات روبلوكس، " +
          "بحسب توفر الغرض واتفاق الطرفين."
      },
      {
        name: "『 📦 ・ أغراض أخرى 』",
        value:
          "للطلبات الأخرى المسموح بها، وضّح التفاصيل " +
          "واتفق مع الطرف الثاني."
      },
      {
        name: "『 ⚖️ ・ القوانين 』",
        value:
          "1. ممنوع النصب والاحتيال.\n" +
          "2. اتفقوا على السعر والتفاصيل قبل الصفقة.\n" +
          "3. اطلب وسيطًا معتمدًا وانتظر قبوله.\n" +
          "4. لا تشارك كلمات المرور أو معلوماتك الخاصة.\n" +
          "5. ممنوع بيع الأشياء المسروقة أو المخالفة.\n" +
          "6. احتفظ بإثباتات الاتفاق."
      },
      {
        name: "『 🤝 ・ طريقة الصفقة 』",
        value:
          "اضغط زر طلب وسيط في لوحة الوسيط، " +
          "حدد الطرف الثاني وانتظر قبول الوسيط قبل فتح الروم."
      }
    )
    .setFooter({ text: "MARKET • تعامل بأمان" })
    .setTimestamp();
}

function middlemanEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🤝・طلب وسيط")
    .setDescription(
      "تبي تسوي صفقة بأمان؟\n\n" +
      "اضغط **طلب وسيط** وحدد الطرف الثاني في الصفقة.\n\n" +
      "ينشر البوت طلبك، ثم يستلمه وسيط معتمد.\n\n" +
      "بعد قبول الوسيط، يتفعّل زر فتح روم الصفقة للطرفين.\n\n" +
      "🔒 روم الصفقة خاص بالأطراف المعنيين والإدارة."
    )
    .setFooter({ text: "MIDDLEMAN • Karen Rank" })
    .setTimestamp();
}

function requestEmbed(request) {
  return new EmbedBuilder()
    .setColor(request.mediatorId ? 0x57f287 : 0xfee75c)
    .setTitle("🤝・طلب وساطة جديد")
    .setDescription(
      `**صاحب الطلب:** <@${request.buyerId}>\n` +
      `**الطرف الثاني:** <@${request.sellerId}>\n` +
      `**رقم الطلب:** \`${request.id}\`\n\n` +
      (
        request.mediatorId
          ? `✅ **الوسيط المستلم:** <@${request.mediatorId}>\n` +
            "يمكن للطرفين فتح روم الصفقة الآن."
          : "⏳ بانتظار وسيط معتمد يستلم الطلب."
      )
    )
    .setFooter({ text: "لا تبدأ الصفقة قبل قبول الوسيط" })
    .setTimestamp();
}

function requestButtons(request) {
  const row = new ActionRowBuilder();

  if (!request.mediatorId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mm_claim_${request.id}`)
        .setLabel("استلام الطلب")
        .setStyle(ButtonStyle.Success)
    );
  } else if (!request.roomId) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mm_open_${request.id}`)
        .setLabel("🔒 فتح روم الصفقة")
        .setStyle(ButtonStyle.Primary)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mm_done_${request.id}`)
        .setLabel("تم فتح روم الصفقة")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );
  }

  return row;
}

async function publishPanel(interaction, type) {
  if (!isStaff(interaction)) {
    await interaction.reply({
      content: "❌ هذا الأمر للأونر والإدارة فقط.",
      ephemeral: true
    });
    return true;
  }

  const channel = interaction.options.getChannel("channel");

  try {
    await channel.send(
      type === "market"
        ? { embeds: [marketEmbed()] }
        : {
            embeds: [middlemanEmbed()],
            components: [panelButtons()]
          }
    );

    await interaction.reply({
      content: `✅ تم نشر اللوحة في ${channel}.`,
      ephemeral: true
    });
  } catch (error) {
    console.error("PANEL PUBLISH ERROR:", error);

    await interaction.reply({
      content: "❌ تعذر نشر اللوحة. تأكد من صلاحيات البوت في الروم.",
      ephemeral: true
    });
  }

  return true;
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === "marketpanel") {
      return publishPanel(interaction, "market");
    }

    if (interaction.commandName === "middlemanpanel") {
      return publishPanel(interaction, "middleman");
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId === "mm_request") {
      const modal = new ModalBuilder()
        .setCustomId(`mm_modal_${interaction.user.id}`)
        .setTitle("طلب وسيط");

      const partnerInput = new TextInputBuilder()
        .setCustomId("partner")
        .setLabel("منشن أو ID الطرف الثاني")
        .setPlaceholder("@username أو User ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(30);

      modal.addComponents(
        new ActionRowBuilder().addComponents(partnerInput)
      );

      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId.startsWith("mm_claim_")) {
      const id = interaction.customId.slice("mm_claim_".length);
      const request = requests.get(id);

      if (!request) {
        await interaction.reply({
          content: "❌ الطلب غير موجود أو انتهت صلاحيته بعد إعادة تشغيل البوت.",
          ephemeral: true
        });
        return true;
      }

      if (!hasRole(interaction, MIDDLEMAN_ROLE_ID)) {
        await interaction.reply({
          content: "❌ استلام الطلب للوسطاء المعتمدين فقط.",
          ephemeral: true
        });
        return true;
      }

      if (request.mediatorId) {
        await interaction.reply({
          content: "❌ تم استلام هذا الطلب بالفعل.",
          ephemeral: true
        });
        return true;
      }

      if (
        interaction.user.id === request.buyerId ||
        interaction.user.id === request.sellerId
      ) {
        await interaction.reply({
          content: "❌ أطراف الصفقة لا يمكنهم استلام طلبهم كوسيط.",
          ephemeral: true
        });
        return true;
      }

      request.mediatorId = interaction.user.id;

      await interaction.update({
        embeds: [requestEmbed(request)],
        components: [requestButtons(request)]
      });

      return true;
    }

    if (interaction.customId.startsWith("mm_open_")) {
      const id = interaction.customId.slice("mm_open_".length);
      const request = requests.get(id);

      if (!request || !request.mediatorId) {
        await interaction.reply({
          content: "❌ يجب قبول الوسيط للطلب أولًا.",
          ephemeral: true
        });
        return true;
      }

      if (
        interaction.user.id !== request.buyerId &&
        interaction.user.id !== request.sellerId
      ) {
        await interaction.reply({
          content: "❌ فتح الروم متاح لطرفي الصفقة فقط.",
          ephemeral: true
        });
        return true;
      }

      if (request.roomId) {
        await interaction.reply({
          content: `الروم موجود بالفعل: <#${request.roomId}>`,
          ephemeral: true
        });
        return true;
      }

      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          ...[
            request.buyerId,
            request.sellerId,
            request.mediatorId,
            guild.ownerId
          ].map(userId => ({
            id: userId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          })),
          ...[ADMIN_ROLE_ID, OWNER_ROLE_ID].map(roleId => ({
            id: roleId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }))
        ];

        const channel = await guild.channels.create({
          name: `deal-${id}`.slice(0, 90),
          type: ChannelType.GuildText,
          permissionOverwrites: overwrites
        });

        request.roomId = channel.id;

        await channel.send({
          content:
            `<@${request.buyerId}> <@${request.sellerId}> ` +
            `<@${request.mediatorId}> <@${guild.ownerId}> ` +
            `<@&${ADMIN_ROLE_ID}> <@&${OWNER_ROLE_ID}>`,
          embeds: [
            new EmbedBuilder()
              .setColor(0x57f287)
              .setTitle("🔒・روم الصفقة")
              .setDescription(
                `**المشتري:** <@${request.buyerId}>\n` +
                `**البائع:** <@${request.sellerId}>\n` +
                `**الوسيط:** <@${request.mediatorId}>\n\n` +
                "اتفقوا على تفاصيل الصفقة هنا، وانتظروا تعليمات الوسيط.\n" +
                "لا تشاركوا كلمات المرور أو المعلومات الخاصة."
              )
              .setTimestamp()
          ],
          allowedMentions: {
            users: [
              request.buyerId,
              request.sellerId,
              request.mediatorId,
              guild.ownerId
            ],
            roles: [ADMIN_ROLE_ID, OWNER_ROLE_ID]
          }
        });

        await interaction.message.edit({
          embeds: [requestEmbed(request)],
          components: [requestButtons(request)]
        });

        await interaction.editReply({
          content: `✅ تم إنشاء روم الصفقة: ${channel}`
        });
      } catch (error) {
        console.error("DEAL ROOM ERROR:", error);

        await interaction.editReply({
          content: "❌ تعذر إنشاء الروم. تأكد أن البوت يملك صلاحية إدارة الرومات."
        });
      }

      return true;
    }

    if (interaction.customId.startsWith("mm_done_")) {
      await interaction.reply({
        content: "ℹ️ تم إنشاء روم الصفقة لهذا الطلب مسبقًا.",
        ephemeral: true
      });
      return true;
    }
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("mm_modal_")
  ) {
    const buyerId = interaction.customId.slice("mm_modal_".length);

    if (interaction.user.id !== buyerId) {
      await interaction.reply({
        content: "❌ هذا الطلب ليس لك.",
        ephemeral: true
      });
      return true;
    }

    const input = interaction.fields.getTextInputValue("partner").trim();
    const match = input.match(/^<@!?(\d+)>$/);
    const sellerId = match?.[1] || input;

    if (!/^\d{17,20}$/.test(sellerId)) {
      await interaction.reply({
        content: "❌ اكتب منشن الطرف الثاني أو الـID الصحيح.",
        ephemeral: true
      });
      return true;
    }

    if (sellerId === buyerId) {
      await interaction.reply({
        content: "❌ ما تقدر تطلب وسيط لنفسك.",
        ephemeral: true
      });
      return true;
    }

    const seller = await interaction.guild.members
      .fetch(sellerId)
      .catch(() => null);

    if (!seller || seller.user.bot) {
      await interaction.reply({
        content: "❌ الطرف الثاني غير موجود في السيرفر أو أنه بوت.",
        ephemeral: true
      });
      return true;
    }

    const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const request = {
      id,
      buyerId,
      sellerId,
      mediatorId: null,
      roomId: null
    };

    requests.set(id, request);

    try {
      await interaction.channel.send({
        embeds: [requestEmbed(request)],
        components: [requestButtons(request)]
      });

      await interaction.reply({
        content: "✅ تم إرسال طلبك. انتظر وسيطًا معتمدًا يستلمه.",
        ephemeral: true
      });
    } catch (error) {
      requests.delete(id);
      console.error("MIDDLEMAN REQUEST ERROR:", error);

      await interaction.reply({
        content: "❌ تعذر إرسال الطلب. تأكد من صلاحيات البوت.",
        ephemeral: true
      });
    }

    return true;
  }

  return false;
}

module.exports = {
  commands,
  handleInteraction
};
