
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

const ADMIN_ROLE_ID = "1554456128472219770";
const MIDDLEMAN_ROLE_ID = "1559877945441648773";
const OWNER_ROLE_ID = "1554456245329596486";

const listings = new Map();
const purchases = new Map();
const middlemanRequests = new Map();
const creatingRooms = new Set();

const categories = {
  accounts: "حسابات Roblox",
  items: "أغراض Roblox داخل الألعاب",
  misc: "أغراض أخرى"
};

const commands = [
  new SlashCommandBuilder()
    .setName("marketpanel")
    .setDescription("إرسال لوحة السوق"),

  new SlashCommandBuilder()
    .setName("middlemanpanel")
    .setDescription("إرسال لوحة طلب الوسيط")
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
  const roles = interaction.member?.roles;

  if (roles?.cache) return roles.cache.has(roleId);
  if (Array.isArray(roles)) return roles.includes(roleId);

  return false;
}

function marketEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("『 KAREN RANK ・ MARKET 』")
    .setDescription(
      "مرحبًا بك في سوق السيرفر\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "🎮 **حسابات Roblox**\n" +
      "بيع وشراء الحسابات حسب القوانين.\n\n" +
      "🧩 **أغراض Roblox داخل الألعاب**\n" +
      "بيع وشراء الأغراض داخل الألعاب.\n\n" +
      "📦 **أغراض أخرى**\n" +
      "اعرض أغراضك المسموح بها للبيع.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "📜 **قوانين السوق**\n" +
      "• يمنع الاحتيال أو انتحال شخصية الآخرين.\n" +
      "• لا تشارك كلمات المرور أو رموز التحقق.\n" +
      "• اتفق على السعر والتفاصيل قبل إتمام الصفقة.\n" +
      "• استخدم الوسيط عند الحاجة.\n" +
      "• تداول حسابات Roblox قد يخالف شروط المنصة؛ تحقق من الشروط قبل أي معاملة."
    )
    .setFooter({ text: "Karen Rank • Market" })
    .setTimestamp();
}

function marketPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("market_new_accounts")
        .setLabel("بيع حساب Roblox")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("market_new_items")
        .setLabel("بيع أغراض داخل لعبة")
        .setStyle(ButtonStyle.Primary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("market_new_misc")
        .setLabel("بيع أغراض أخرى")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("market_rules")
        .setLabel("القوانين")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

function middlemanEmbed() {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("『 KAREN RANK ・ MIDDLEMAN 』")
    .setDescription(
      "تحتاج وسيطًا لمعاملتك؟\n\n" +
      "اضغط **طلب وسيط** ثم أدخل منشن الطرف الثاني أو Discord ID الخاص به.\n\n" +
      "بعد استلام الوسيط للطلب، يستطيع أحد طرفي الصفقة فتح روم خاص.\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "• لا تشارك كلمات المرور أو رموز التحقق.\n" +
      "• تحقق من هوية الوسيط.\n" +
      "• اتفقوا على تفاصيل الصفقة بوضوح."
    )
    .setFooter({ text: "Karen Rank • Middleman Service" })
    .setTimestamp();
}

function middlemanPanelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("mm_request")
        .setLabel("طلب وسيط")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function listingButtons(listingId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`market_buy_${listingId}`)
        .setLabel("🛒 طلب شراء")
        .setStyle(ButtonStyle.Success)
    )
  ];
}

function purchaseButtons(purchaseId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`market_confirm_${purchaseId}`)
        .setLabel("✅ تأكيد البيع")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`market_cancel_${purchaseId}`)
        .setLabel("إلغاء الطلب")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

function middlemanRequestButtons(requestId, claimed = false) {
  const row = new ActionRowBuilder();

  if (!claimed) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mm_claim_${requestId}`)
        .setLabel("استلام الطلب")
        .setStyle(ButtonStyle.Primary)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`mm_open_${requestId}`)
        .setLabel("فتح روم المعاملة")
        .setStyle(ButtonStyle.Success)
    );
  }

  return [row];
}

function getUserId(input) {
  const text = input.trim();
  const mention = text.match(/^<@!?(\d+)>$/);

  if (mention) return mention[1];

  const idMatch = text.match(/^(\d{17,20})$/);
  if (idMatch) return idMatch[1];

  return null;
}

function listingModal(category) {
  const modal = new ModalBuilder()
    .setCustomId(`market_listing_${category}`)
    .setTitle("نشر إعلان بيع");

  const title = new TextInputBuilder()
    .setCustomId("item_title")
    .setLabel("اسم الغرض")
    .setPlaceholder("اكتب اسم الغرض")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(80);

  const price = new TextInputBuilder()
    .setCustomId("item_price")
    .setLabel("السعر")
    .setPlaceholder("مثال: 50 ريال أو 100 Robux")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50);

  const details = new TextInputBuilder()
    .setCustomId("item_details")
    .setLabel("تفاصيل العرض وطريقة التسليم")
    .setPlaceholder("اكتب تفاصيل الغرض هنا")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(800);

  modal.addComponents(
    new ActionRowBuilder().addComponents(title),
    new ActionRowBuilder().addComponents(price),
    new ActionRowBuilder().addComponents(details)
  );

  return modal;
}

function makeListingEmbed(listing) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(`🛒 ${listing.title}`)
    .setDescription(
      `**القسم:** ${categories[listing.category]}\n\n` +
      `**السعر:** ${listing.price}\n\n` +
      `**التفاصيل:**\n${listing.details}\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n" +
      `**البائع:** <@${listing.sellerId}>\n` +
      "**الحالة:** 🟢 متوفر"
    )
    .setFooter({ text: `Listing ID: ${listing.id}` })
    .setTimestamp();
}

function makePurchaseEmbed(purchase, statusText) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("『 طلب شراء جديد 』")
    .setDescription(
      `**الغرض:** ${purchase.listingTitle}\n` +
      `**السعر:** ${purchase.price}\n\n` +
      `**البائع:** <@${purchase.sellerId}>\n` +
      `**المشتري:** <@${purchase.buyerId}>\n\n` +
      `**الحالة:** ${statusText}\n\n` +
      "على البائع التأكد من تفاصيل الصفقة قبل تأكيد البيع."
    )
    .setTimestamp();
}

function dealRoomEmbed(purchase) {
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("『 KAREN RANK ・ DEAL ROOM 』")
    .setDescription(
      "## 🔒 روم الصفقة الخاص\n\n" +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      `📦 **الغرض:** ${purchase.listingTitle}\n` +
      `💰 **السعر المتفق عليه:** ${purchase.price}\n\n` +
      `🛒 **المشتري:** <@${purchase.buyerId}>\n` +
      `🏷️ **البائع:** <@${purchase.sellerId}>\n\n` +
      "━━━━━━━━━━━━━━━━━━━━\n\n" +
      "📌 **تعليمات الصفقة**\n" +
      "• اتفقوا على تفاصيل التسليم هنا.\n" +
      "• لا تشاركوا كلمات المرور أو رموز التحقق.\n" +
      "• لا تسلّموا الغرض قبل التأكد من الاتفاق.\n" +
      "• يمكنكم طلب وسيط إذا احتجتم مساعدة.\n\n" +
      "عند انتهاء الصفقة، اضغط زر إغلاق الروم."
    )
    .setFooter({ text: "Karen Rank • Secure Deal" })
    .setTimestamp();
}

function dealRoomButtons(purchaseId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`market_close_room_${purchaseId}`)
        .setLabel("🔒 إغلاق الروم")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

async function createPrivateRoom(guild, data, roomType = "deal") {
  const buyer = await guild.members.fetch(data.buyerId);
  const seller = await guild.members.fetch(data.sellerId);

  const permissions = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    }
  ];

  const memberIds = new Set([
    buyer.id,
    seller.id,
    guild.ownerId
  ]);

  if (data.mediatorId) memberIds.add(data.mediatorId);

  for (const userId of memberIds) {
    permissions.push({
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ]
    });
  }

  for (const roleId of [ADMIN_ROLE_ID, OWNER_ROLE_ID]) {
    if (guild.roles.cache.has(roleId)) {
      permissions.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }
  }

  if (data.mediatorId && guild.roles.cache.has(MIDDLEMAN_ROLE_ID)) {
    permissions.push({
      id: MIDDLEMAN_ROLE_ID,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory
      ]
    });
  }

  const channel = await guild.channels.create({
    name: `${roomType}-${data.id}`.slice(0, 90),
    type: ChannelType.GuildText,
    permissionOverwrites: permissions
  });

  return channel;
}

async function handleInteraction(interaction) {
  if (interaction.isChatInputCommand()) {
    if (
      interaction.commandName === "marketpanel" ||
      interaction.commandName === "middlemanpanel"
    ) {
      if (!isStaff(interaction)) {
        await interaction.reply({
          content: "❌ هذا الأمر للإدارة فقط.",
          ephemeral: true
        });
        return true;
      }

      await interaction.deferReply({ ephemeral: true });

      if (interaction.commandName === "marketpanel") {
        await interaction.channel.send({
          embeds: [marketEmbed()],
          components: marketPanelComponents()
        });

        await interaction.editReply("✅ تم إرسال لوحة السوق.");
      } else {
        await interaction.channel.send({
          embeds: [middlemanEmbed()],
          components: middlemanPanelComponents()
        });

        await interaction.editReply("✅ تم إرسال لوحة الوسيط.");
      }

      return true;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith("market_new_")) {
      const category = interaction.customId.replace("market_new_", "");

      if (!categories[category]) {
        await interaction.reply({
          content: "❌ هذا القسم غير معروف.",
          ephemeral: true
        });
        return true;
      }

      await interaction.showModal(listingModal(category));
      return true;
    }

    if (interaction.customId === "market_rules") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865f2)
            .setTitle("📜 قوانين السوق")
            .setDescription(
              "• يمنع الاحتيال أو انتحال شخصية الآخرين.\n" +
              "• لا تشارك كلمات المرور أو رموز التحقق.\n" +
              "• اتفق على السعر والتفاصيل قبل الصفقة.\n" +
              "• استخدم الوسيط عند الحاجة.\n" +
              "• تداول حسابات Roblox قد يخالف شروط المنصة."
            )
        ],
        ephemeral: true
      });
      return true;
    }

    if (interaction.customId.startsWith("market_buy_")) {
      const listingId = interaction.customId.slice("market_buy_".length);
      const listing = listings.get(listingId);

      if (!listing || listing.status !== "available") {
        await interaction.reply({
          content: "❌ هذا الإعلان لم يعد متوفرًا.",
          ephemeral: true
        });
        return true;
      }

      if (interaction.user.id === listing.sellerId) {
        await interaction.reply({
          content: "❌ ما تقدر تشتري إعلانك بنفسك.",
          ephemeral: true
        });
        return true;
      }

      if (listing.pendingPurchaseId) {
        await interaction.reply({
          content: "⏳ يوجد طلب شراء قيد المراجعة لهذا الإعلان.",
          ephemeral: true
        });
        return true;
      }

      const purchaseId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const purchase = {
        id: purchaseId,
        listingId,
        listingTitle: listing.title,
        price: listing.price,
        sellerId: listing.sellerId,
        buyerId: interaction.user.id,
        status: "pending",
        roomId: null
      };

      purchases.set(purchaseId, purchase);
      listing.pendingPurchaseId = purchaseId;

      await interaction.reply({
        content: "✅ تم إرسال طلب الشراء للبائع. انتظر تأكيده.",
        ephemeral: true
      });

      const purchaseMessage = await interaction.channel.send({
        content: `<@${listing.sellerId}>`,
        embeds: [makePurchaseEmbed(purchase, "⏳ بانتظار تأكيد البائع")],
        components: purchaseButtons(purchaseId),
        allowedMentions: { users: [listing.sellerId] }
      });

      purchase.messageId = purchaseMessage.id;
      purchase.channelId = interaction.channel.id;
      return true;
    }

    if (interaction.customId.startsWith("market_confirm_")) {
      const purchaseId = interaction.customId.slice("market_confirm_".length);
      const purchase = purchases.get(purchaseId);

      if (!purchase || purchase.status !== "pending") {
        await interaction.reply({
          content: "❌ طلب الشراء غير متاح أو تم التعامل معه مسبقًا.",
          ephemeral: true
        });
        return true;
      }

      if (interaction.user.id !== purchase.sellerId) {
        await interaction.reply({
          content: "❌ زر التأكيد مخصص للبائع فقط.",
          ephemeral: true
        });
        return true;
      }

      if (creatingRooms.has(purchaseId)) {
        await interaction.reply({
          content: "⏳ يتم إنشاء روم الصفقة، انتظر قليلًا.",
          ephemeral: true
        });
        return true;
      }

      creatingRooms.add(purchaseId);
      await interaction.deferReply({ ephemeral: true });

      try {
        const room = await createPrivateRoom(interaction.guild, purchase, "deal");

        purchase.roomId = room.id;
        purchase.status = "confirmed";

        const listing = listings.get(purchase.listingId);
        if (listing) listing.status = "reserved";

        await room.send({
          content: `<@${purchase.buyerId}> <@${purchase.sellerId}>`,
          embeds: [dealRoomEmbed(purchase)],
          components: dealRoomButtons(purchaseId),
          allowedMentions: {
            users: [purchase.buyerId, purchase.sellerId]
          }
        });

        await interaction.message.edit({
          embeds: [makePurchaseEmbed(purchase, `✅ تم تأكيد البيع • <#${room.id}>`)],
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`market_done_${purchaseId}`)
                .setLabel("تم تأكيد البيع")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            )
          ]
        });

        await interaction.editReply(`✅ تم إنشاء روم الصفقة: <#${room.id}>`);
      } catch (error) {
        console.error("MARKET DEAL ROOM ERROR:", error);
        await interaction.editReply(
          "❌ ما قدرت أنشئ روم الصفقة. تأكد أن البوت يملك صلاحية Manage Channels."
        );
      } finally {
        creatingRooms.delete(purchaseId);
      }

      return true;
    }

    if (interaction.customId.startsWith("market_cancel_")) {
      const purchaseId = interaction.customId.slice("market_cancel_".length);
      const purchase = purchases.get(purchaseId);

      if (!purchase || purchase.status !== "pending") {
        await interaction.reply({
          content: "❌ هذا الطلب غير متاح.",
          ephemeral: true
        });
        return true;
      }

      if (
        interaction.user.id !== purchase.sellerId &&
        interaction.user.id !== purchase.buyerId
      ) {
        await interaction.reply({
          content: "❌ فقط البائع أو المشتري يقدرون يلغون الطلب.",
          ephemeral: true
        });
        return true;
      }

      purchase.status = "cancelled";

      const listing = listings.get(purchase.listingId);
      if (listing) listing.pendingPurchaseId = null;

      await interaction.update({
        embeds: [makePurchaseEmbed(purchase, "❌ تم إلغاء الطلب")],
        components: []
      });

      return true;
    }

    if (interaction.customId.startsWith("market_close_room_")) {
      const purchaseId = interaction.customId.slice("market_close_room_".length);
      const purchase = purchases.get(purchaseId);

      if (!purchase || interaction.channel.id !== purchase.roomId) {
        await interaction.reply({
          content: "❌ هذا ليس روم الصفقة الصحيح.",
          ephemeral: true
        });
        return true;
      }

      const allowed =
        interaction.user.id === purchase.buyerId ||
        interaction.user.id === purchase.sellerId ||
        interaction.user.id === interaction.guild.ownerId ||
        hasRole(interaction, ADMIN_ROLE_ID) ||
        hasRole(interaction, OWNER_ROLE_ID);

      if (!allowed) {
        await interaction.reply({
          content: "❌ فقط أطراف الصفقة أو الإدارة يقدرون يغلقون الروم.",
          ephemeral: true
        });
        return true;
      }

      await interaction.reply("🔒 سيتم إغلاق روم الصفقة خلال 5 ثوانٍ.");

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (error) {
          console.error("DEAL ROOM CLOSE ERROR:", error);
        }
      }, 5000);

      purchase.status = "closed";
      return true;
    }

    if (interaction.customId === "mm_request") {
      const modal = new ModalBuilder()
        .setCustomId("mm_request_modal")
        .setTitle("طلب وسيط");

      const input = new TextInputBuilder()
        .setCustomId("other_party")
        .setLabel("منشن الطرف الثاني أو اكتب ID")
        .setPlaceholder("الصق المنشن الكامل أو Discord ID")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(30);

      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId.startsWith("mm_claim_")) {
      if (!hasRole(interaction, MIDDLEMAN_ROLE_ID)) {
        await interaction.reply({
          content: "❌ هذا الزر مخصص لأعضاء فريق الوسطاء.",
          ephemeral: true
        });
        return true;
      }

      const requestId = interaction.customId.slice("mm_claim_".length);
      const request = middlemanRequests.get(requestId);

      if (!request || request.status !== "pending") {
        await interaction.reply({
          content: "❌ هذا الطلب غير متاح أو تم استلامه مسبقًا.",
          ephemeral: true
        });
        return true;
      }

      if (
        interaction.user.id === request.requesterId ||
        interaction.user.id === request.otherPartyId
      ) {
        await interaction.reply({
          content: "❌ أحد أطراف المعاملة لا يستطيع استلام الطلب كوسيط.",
          ephemeral: true
        });
        return true;
      }

      request.mediatorId = interaction.user.id;
      request.status = "claimed";

      const embed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x57f287)
        .addFields({
          name: "الوسيط المستلم",
          value: `<@${interaction.user.id}>`
        });

      await interaction.message.edit({
        embeds: [embed],
        components: middlemanRequestButtons(requestId, true)
      });

      await interaction.reply({
        content: "✅ استلمت الطلب. يستطيع أحد الطرفين الآن فتح روم المعاملة.",
        ephemeral: true
      });

      return true;
    }

    if (interaction.customId.startsWith("mm_open_")) {
      const requestId = interaction.customId.slice("mm_open_".length);
      const request = middlemanRequests.get(requestId);

      if (!request || request.status !== "claimed") {
        await interaction.reply({
          content: "❌ الطلب غير جاهز لفتح الروم.",
          ephemeral: true
        });
        return true;
      }

      if (
        ![request.requesterId, request.otherPartyId].includes(interaction.user.id)
      ) {
        await interaction.reply({
          content: "❌ فقط طرفا المعاملة يقدران فتح الروم.",
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

      if (creatingRooms.has(requestId)) {
        await interaction.reply({
          content: "⏳ يتم إنشاء الروم بالفعل، انتظر قليلًا.",
          ephemeral: true
        });
        return true;
      }

      creatingRooms.add(requestId);
      await interaction.deferReply({ ephemeral: true });

      try {
        const data = {
          id: requestId,
          buyerId: request.requesterId,
          sellerId: request.otherPartyId,
          mediatorId: request.mediatorId
        };

        const room = await createPrivateRoom(interaction.guild, data, "middleman");

        request.roomId = room.id;
        request.status = "open";

        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("『 KAREN RANK ・ MIDDLEMAN ROOM 』")
          .setDescription(
            "## 🔒 روم المعاملة الخاص\n\n" +
            "━━━━━━━━━━━━━━━━━━━━\n\n" +
            `🧑 **صاحب الطلب:** <@${request.requesterId}>\n` +
            `🧑 **الطرف الثاني:** <@${request.otherPartyId}>\n` +
            `🛡️ **الوسيط:** <@${request.mediatorId}>\n\n` +
            "━━━━━━━━━━━━━━━━━━━━\n\n" +
            "📌 **التعليمات**\n" +
            "• اتفقوا على تفاصيل المعاملة بوضوح.\n" +
            "• لا تشاركوا كلمات المرور أو رموز التحقق.\n" +
            "• تأكدوا من التسليم قبل إنهاء المعاملة.\n\n" +
            "الوسيط أو الإدارة يقدرون يغلقون الروم عند الانتهاء."
          )
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`mm_close_${requestId}`)
            .setLabel("🔒 إغلاق الروم")
            .setStyle(ButtonStyle.Danger)
        );

        await room.send({
          content:
            `<@${request.requesterId}> <@${request.otherPartyId}> <@${request.mediatorId}>`,
          embeds: [embed],
          components: [row],
          allowedMentions: {
            users: [
              request.requesterId,
              request.otherPartyId,
              request.mediatorId
            ]
          }
        });

        await interaction.message.edit({
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`mm_opened_${requestId}`)
                .setLabel("تم فتح روم المعاملة")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
            )
          ]
        });

        await interaction.editReply(`✅ تم إنشاء روم المعاملة: <#${room.id}>`);
      } catch (error) {
        console.error("MIDDLEMAN ROOM ERROR:", error);
        await interaction.editReply(
          "❌ تعذر إنشاء الروم. تأكد أن البوت يملك صلاحية Manage Channels وأن الطرفين موجودان في السيرفر."
        );
      } finally {
        creatingRooms.delete(requestId);
      }

      return true;
    }

    if (interaction.customId.startsWith("mm_close_")) {
      const requestId = interaction.customId.slice("mm_close_".length);
      const request = middlemanRequests.get(requestId);

      if (!request || request.roomId !== interaction.channel.id) {
        await interaction.reply({
          content: "❌ هذا ليس روم المعاملة الصحيح.",
          ephemeral: true
        });
        return true;
      }

      const allowed =
        interaction.user.id === request.mediatorId ||
        interaction.user.id === interaction.guild.ownerId ||
        hasRole(interaction, ADMIN_ROLE_ID) ||
        hasRole(interaction, OWNER_ROLE_ID);

      if (!allowed) {
        await interaction.reply({
          content: "❌ الوسيط أو الإدارة فقط يقدرون يغلقون الروم.",
          ephemeral: true
        });
        return true;
      }

      await interaction.reply("🔒 سيتم إغلاق روم المعاملة خلال 5 ثوانٍ.");

      setTimeout(async () => {
        try {
          await interaction.channel.delete();
        } catch (error) {
          console.error("MIDDLEMAN ROOM CLOSE ERROR:", error);
        }
      }, 5000);

      request.status = "closed";
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith("market_listing_")) {
      const category = interaction.customId.replace("market_listing_", "");

      if (!categories[category]) {
        await interaction.reply({
          content: "❌ هذا القسم غير معروف.",
          ephemeral: true
        });
        return true;
      }

      const title = interaction.fields.getTextInputValue("item_title").trim();
      const price = interaction.fields.getTextInputValue("item_price").trim();
      const details = interaction.fields.getTextInputValue("item_details").trim();

      if (!title || !price || !details) {
        await interaction.reply({
          content: "❌ املأ جميع الخانات.",
          ephemeral: true
        });
        return true;
      }

      const listingId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const listing = {
        id: listingId,
        category,
        title,
        price,
        details,
        sellerId: interaction.user.id,
        status: "available",
        pendingPurchaseId: null
      };

      listings.set(listingId, listing);

      await interaction.reply({
        content: "✅ تم نشر إعلانك في هذا الروم.",
        ephemeral: true
      });

      await interaction.channel.send({
        embeds: [makeListingEmbed(listing)],
        components: listingButtons(listingId)
      });

      return true;
    }

    if (interaction.customId === "mm_request_modal") {
      const input = interaction.fields.getTextInputValue("other_party").trim();
      const otherPartyId = getUserId(input);

      if (!otherPartyId) {
        await interaction.reply({
          content: "❌ ما قدرت أقرأ المنشن. الصق المنشن الكامل مثل `<@123456789012345678>` أو اكتب Discord ID فقط.",
          ephemeral: true
        });
        return true;
      }

      if (otherPartyId === interaction.user.id) {
        await interaction.reply({
          content: "❌ ما تقدر تطلب وسيط لنفسك.",
          ephemeral: true
        });
        return true;
      }

      let otherParty;

      try {
        otherParty = await interaction.guild.members.fetch(otherPartyId);
      } catch {
        await interaction.reply({
          content: "❌ ما لقيت الطرف الثاني داخل هذا السيرفر. تأكد من الـID.",
          ephemeral: true
        });
        return true;
      }

      const requestId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const request = {
        id: requestId,
        requesterId: interaction.user.id,
        otherPartyId: otherParty.id,
        mediatorId: null,
        roomId: null,
        status: "pending"
      };

      middlemanRequests.set(requestId, request);

      const embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("『 طلب وسيط جديد 』")
        .setDescription(
          `🧑 **صاحب الطلب:** <@${interaction.user.id}>\n` +
          `🧑 **الطرف الثاني:** <@${otherParty.id}>\n\n` +
          "**الحالة:** ⏳ بانتظار استلام وسيط.\n\n" +
          "أعضاء فريق الوسطاء فقط يستطيعون استلام الطلب."
        )
        .setFooter({ text: `Request ID: ${requestId}` })
        .setTimestamp();

      await interaction.reply({
        content: "✅ تم إرسال طلبك لفريق الوسطاء.",
        ephemeral: true
      });

      try {
        await interaction.channel.send({
          content: `<@&${MIDDLEMAN_ROLE_ID}>`,
          embeds: [embed],
          components: middlemanRequestButtons(requestId),
          allowedMentions: { roles: [MIDDLEMAN_ROLE_ID] }
        });
      } catch (error) {
        middlemanRequests.delete(requestId);
        console.error("MIDDLEMAN REQUEST SEND ERROR:", error);

        await interaction.followUp({
          content: "❌ تعذر إرسال الطلب. تأكد من صلاحيات البوت.",
          ephemeral: true
        });
      }

      return true;
    }
  }

  return false;
}

module.exports = {
  commands,
  handleInteraction
};
