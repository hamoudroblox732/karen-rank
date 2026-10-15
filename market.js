
const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    StringSelectMenuBuilder
} = require("discord.js");

const DEVELOPMENT_ROLE_ID = process.env.DEVELOPMENT_ROLE_ID;
const MIDDLEMAN_ROLE_NAME = "MM Service";

let middlemanChannelId = null;

const categories = [
    { id: "account_buy", label: "شراء حساب", emoji: "🛒" },
    { id: "account_sell", label: "بيع حساب", emoji: "💰" },
    { id: "items_buy", label: "شراء أغراض", emoji: "📦" },
    { id: "items_sell", label: "بيع أغراض", emoji: "🎁" },
    { id: "other_buy", label: "شراء أشياء أخرى", emoji: "🛍️" },
    { id: "other_sell", label: "بيع أشياء أخرى", emoji: "💳" }
];

const queues = new Map();
const deals = new Map();
const claimedRequests = new Set();
const closingDeals = new Set();

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function logError(label, error) {
    console.error(`[MARKET] ${label}`);
    console.error("Code:", error?.code ?? "Unknown");
    console.error("Message:", error?.message ?? error);
    if (error?.rawError) console.error("Discord error:", error.rawError);
}

function categoryName(id) {
    return categories.find(category => category.id === id)?.label || "صفقة";
}

function isStaff(member, guild) {
    if (!member) return false;

    if (member.id === guild.ownerId) return true;

    if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
    }

    return Boolean(
        DEVELOPMENT_ROLE_ID &&
        member.roles.cache.has(DEVELOPMENT_ROLE_ID)
    );
}

function isMiddleman(member) {
    if (!member?.roles?.cache) return false;

    return member.roles.cache.some(role =>
        role.name.normalize("NFKC").trim().toLowerCase() ===
        MIDDLEMAN_ROLE_NAME.toLowerCase()
    );
}

function getMiddlemanRole(guild) {
    return guild.roles.cache.find(role =>
        role.name.normalize("NFKC").trim().toLowerCase() ===
        MIDDLEMAN_ROLE_NAME.toLowerCase()
    ) || null;
}

function categoryMenu() {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("market_category_select")
            .setPlaceholder("🛍️ اختر نوع البيع أو الشراء")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                categories.map(category => ({
                    label: category.label,
                    value: category.id,
                    emoji: category.emoji,
                    description: `الدخول في قائمة ${category.label}`
                }))
            )
    );
}

function mediatorChoiceRow(dealId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`market_mediator_yes_${dealId}`)
            .setLabel("مع وسيط")
            .setEmoji("🛡️")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`market_mediator_no_${dealId}`)
            .setLabel("بدون وسيط")
            .setEmoji("🤝")
            .setStyle(ButtonStyle.Secondary)
    );
}

function transactionRulesEmbed(deal, mediatorId) {
    return new EmbedBuilder()
        .setColor(mediatorId ? 0x3498DB : 0x2ECC71)
        .setTitle(
            mediatorId
                ? "🛡️ غرفة وساطة رسمية"
                : "🤝 غرفة البيع والشراء"
        )
        .setDescription([
            "أهلًا بكم في غرفة إتمام الصفقة!",
            "",
            "━━━━━━━━━━━━━━━━━━",
            "📋 **تفاصيل الصفقة**",
            "",
            `**نوع الصفقة:** ${categoryName(deal.category)}`,
            `**الطرف الأول:** <@${deal.users[0]}>`,
            `**الطرف الثاني:** <@${deal.users[1]}>`,
            `**الوسيط:** ${mediatorId ? `<@${mediatorId}>` : "بدون وسيط"}`,
            "",
            "━━━━━━━━━━━━━━━━━━",
            "📜 **قوانين الصفقة**",
            "",
            "1. اتفقوا على تفاصيل الصفقة قبل التنفيذ.",
            "2. يمنع الاحتيال أو انتحال الشخصية.",
            "3. لا تشاركوا كلمات المرور أو المعلومات السرية.",
            "4. احتفظوا بإثباتات الاتفاق عند الحاجة.",
            "5. لا تؤكدوا إكمال الصفقة قبل انتهائها.",
            "6. عند حدوث مشكلة، تواصلوا مع الإدارة.",
            mediatorId
                ? "7. لا تشاركوا بيانات حساباتكم السرية مع أي شخص."
                : "7. هذه الصفقة بدون وسيط؛ تعاملوا بحذر.",
            "",
            "━━━━━━━━━━━━━━━━━━",
            "اضغط **تم إكمال الشراء** بعد انتهاء الصفقة.",
            "اضغط **إغلاق الروم** لإنهاء الغرفة."
        ].join("\n"))
        .setFooter({ text: "Karen Rank • Market" })
        .setTimestamp();
}

function transactionButtons(dealId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`market_complete_${dealId}`)
            .setLabel("تم إكمال الشراء")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`market_close_${dealId}`)
            .setLabel("إغلاق الروم")
            .setEmoji("🔒")
            .setStyle(ButtonStyle.Danger)
    );
}

async function createTransactionChannel(guild, deal, mediatorId = null) {
    let channel = null;

    try {
        const botMember = guild.members.me || await guild.members.fetchMe();
        const middlemanRole = getMiddlemanRole(guild);

        const overwrites = [
            {
                id: guild.roles.everyone.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: botMember.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.EmbedLinks
                ]
            },
            {
                id: guild.ownerId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            }
        ];

        for (const userId of deal.users) {
            overwrites.push({
                id: userId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.EmbedLinks
                ]
            });
        }

        if (mediatorId) {
            overwrites.push({
                id: mediatorId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            });
        }

        if (DEVELOPMENT_ROLE_ID &&
            guild.roles.cache.has(DEVELOPMENT_ROLE_ID)) {
            overwrites.push({
                id: DEVELOPMENT_ROLE_ID,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageMessages
                ]
            });
        }

        channel = await guild.channels.create({
            name: `deal-${deal.users[0].slice(-4)}-${deal.users[1].slice(-4)}`,
            type: ChannelType.GuildText,
            topic: `صفقة ${deal.id} | ${categoryName(deal.category)}`,
            permissionOverwrites: overwrites
        });

        // لا تُعتبر الصفقة جاهزة إلا بعد إرسال الـ Embed بنجاح.
        await channel.send({
            embeds: [transactionRulesEmbed(deal, mediatorId)],
            components: [transactionButtons(deal.id)],
            allowedMentions: {
                parse: [],
                users: [],
                roles: []
            }
        });

        deal.channelId = channel.id;
        deal.mediatorId = mediatorId;
        deals.set(deal.id, deal);

        return channel;
    } catch (error) {
        logError("فشل إنشاء الروم أو إرسال Embed الصفقة", error);

        // إذا أُنشئ الروم وفشل إرسال الـ Embed، نحذف الروم الفاضي.
        if (channel) {
            try {
                await channel.delete("فشل إعداد غرفة الصفقة");
            } catch (deleteError) {
                logError("تعذر حذف الروم الفارغ", deleteError);
            }
        }

        throw error;
    }
}

async function postMediatorRequest(guild, deal) {
    if (!middlemanChannelId) return null;

    const channel = guild.channels.cache.get(middlemanChannelId);

    if (!channel || !channel.isTextBased() || !channel.send) {
        return null;
    }

    const middlemanRole = getMiddlemanRole(guild);

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🛡️ طلب وساطة جديد")
        .setDescription([
            "يوجد طلب وساطة جديد ينتظر الاستلام.",
            "",
            `**نوع الصفقة:** ${categoryName(deal.category)}`,
            `**الطرف الأول:** <@${deal.users[0]}>`,
            `**الطرف الثاني:** <@${deal.users[1]}>`,
            "",
            "اضغط زر استلام الوساطة إذا كنت من رتبة MM Service."
        ].join("\n"))
        .setFooter({ text: "Karen Rank • طلب وساطة" })
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`market_claim_${deal.id}`)
            .setLabel("استلام الوساطة")
            .setEmoji("🛡️")
            .setStyle(ButtonStyle.Success)
    );

    return channel.send({
        content: middlemanRole ? `<@&${middlemanRole.id}>` : undefined,
        embeds: [embed],
        components: [row],
        allowedMentions: {
            parse: [],
            roles: middlemanRole ? [middlemanRole.id] : [],
            users: []
        }
    });
}

const commands = [
    new SlashCommandBuilder()
        .setName("marketpanel")
        .setDescription("إرسال لوحة البيع والشراء")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName("setmiddlemanchannel")
        .setDescription("تحديد روم استقبال طلبات الوساطة")
        .addChannelOption(option =>
            option
                .setName("channel")
                .setDescription("روم استقبال طلبات الوساطة")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "marketpanel") {
            if (!interaction.memberPermissions?.has(
                PermissionFlagsBits.Administrator
            )) {
                return interaction.reply({
                    content: "❌ هذا الأمر للإدارة فقط.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🛍️ سوق البيع والشراء")
                .setDescription([
                    "اختر نوع العملية من القائمة بالأسفل.",
                    "",
                    "🛒 شراء أو بيع حسابات",
                    "📦 شراء أو بيع أغراض",
                    "💳 شراء أو بيع أشياء أخرى",
                    "",
                    "بعد المطابقة، يختار الطرفان الوساطة أو إتمام الصفقة بدون وسيط."
                ].join("\n"))
                .setFooter({ text: "Karen Rank • Market" });

            return interaction.reply({
                embeds: [embed],
                components: [categoryMenu()]
            });
        }

        if (interaction.commandName === "setmiddlemanchannel") {
            if (!interaction.memberPermissions?.has(
                PermissionFlagsBits.Administrator
            )) {
                return interaction.reply({
                    content: "❌ هذا الأمر للإدارة فقط.",
                    ephemeral: true
                });
            }

            middlemanChannelId =
                interaction.options.getChannel("channel").id;

            return interaction.reply({
                content: `✅ تم تحديد روم طلبات الوساطة: <#${middlemanChannelId}>`,
                ephemeral: true
            });
        }
    }

    if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "market_category_select"
    ) {
        const category = interaction.values[0];
        const userId = interaction.user.id;
        const queue = queues.get(category) || [];

        if (queue.some(item => item.userId === userId)) {
            return interaction.reply({
                content: "⚠️ أنت موجود بالفعل في قائمة انتظار هذا النوع.",
                ephemeral: true
            });
        }

        const otherIndex = queue.findIndex(
            item => item.userId !== userId
        );

        if (otherIndex === -1) {
            queue.push({ userId, interaction });
            queues.set(category, queue);

            return interaction.reply({
                content: `⏳ تمت إضافتك لقائمة الانتظار: **${categoryName(category)}**. انتظر الطرف الآخر.`,
                ephemeral: true
            });
        }

        const [other] = queue.splice(otherIndex, 1);
        queues.set(category, queue);

        const dealId = `${Date.now()}_${other.userId}_${userId}`;

        const deal = {
            id: dealId,
            category,
            users: [other.userId, userId],
            choices: new Map(),
            status: "choosing",
            channelId: null,
            mediatorId: null
        };

        deals.set(dealId, deal);

        try {
            await other.interaction.followUp({
                content: "🤝 تمت مطابقتك! اختر مع وسيط أو بدون وسيط.",
                components: [mediatorChoiceRow(dealId)],
                ephemeral: true
            });
        } catch (error) {
            logError("تعذر إشعار اللاعب الأول بالمطابقة", error);
        }

        return interaction.reply({
            content: "🤝 تمت المطابقة! اختر مع وسيط أو بدون وسيط.",
            components: [mediatorChoiceRow(dealId)],
            ephemeral: true
        });
    }

    if (!interaction.isButton()) return;

    const id = interaction.customId;

    if (
        id.startsWith("market_mediator_yes_") ||
        id.startsWith("market_mediator_no_")
    ) {
        const useMediator = id.startsWith("market_mediator_yes_");
        const prefix = useMediator
            ? "market_mediator_yes_"
            : "market_mediator_no_";
        const dealId = id.slice(prefix.length);
        const deal = deals.get(dealId);

        if (!deal || deal.status !== "choosing") {
            return interaction.reply({
                content: "❌ هذا الطلب لم يعد متاحًا.",
                ephemeral: true
            });
        }

        if (!deal.users.includes(interaction.user.id)) {
            return interaction.reply({
                content: "❌ هذا الطلب ليس لك.",
                ephemeral: true
            });
        }

        if (deal.choices.has(interaction.user.id)) {
            return interaction.reply({
                content: "⚠️ لقد سجلت اختيارك مسبقًا.",
                ephemeral: true
            });
        }

        deal.choices.set(interaction.user.id, useMediator);

        await interaction.reply({
            content: "✅ تم تسجيل اختيارك. بانتظار الطرف الآخر.",
            ephemeral: true
        });

        if (deal.choices.size < 2) return;

        const choices = [...deal.choices.values()];

        if (choices[0] !== choices[1]) {
            deal.status = "cancelled";
            deals.delete(dealId);

            return interaction.followUp({
                content: "⚠️ اختياراتكم مختلفة. ارجعوا إلى لوحة السوق وابدؤوا مطابقة جديدة.",
                ephemeral: true
            });
        }

        deal.status = "creating";

        if (choices[0]) {
            try {
                const request = await postMediatorRequest(
                    interaction.guild,
                    deal
                );

                if (!request) {
                    deal.status = "choosing";

                    return interaction.followUp({
                        content: "❌ لم يتم إعداد روم الوساطة. استخدم `/setmiddlemanchannel` لتحديد الروم أولًا.",
                        ephemeral: true
                    });
                }

                deal.status = "waiting_mediator";

                return interaction.followUp({
                    content: "🛡️ تم إرسال طلب الوساطة. انتظر حتى يستلمه وسيط.",
                    ephemeral: true
                });
            } catch (error) {
                logError("فشل إرسال طلب الوساطة", error);
                deal.status = "choosing";

                return interaction.followUp({
                    content: `❌ تعذر إرسال طلب الوساطة. السبب: ${error.message || "خطأ غير معروف"}`,
                    ephemeral: true
                });
            }
        }

        try {
            const channel = await createTransactionChannel(
                interaction.guild,
                deal,
                null
            );

            deal.status = "active";

            return interaction.followUp({
                content: `✅ تم تجهيز الصفقة وإرسال الـ Embed: ${channel}`,
                ephemeral: true
            });
        } catch (error) {
            logError("فشل إنشاء صفقة بدون وسيط", error);
            deals.delete(dealId);

            return interaction.followUp({
                content: `❌ فشل تجهيز الصفقة. السبب: ${error.message || "خطأ غير معروف"}. راجع سجل البوت لمعرفة رمز خطأ Discord.`,
                ephemeral: true
            });
        }
    }

    if (id.startsWith("market_claim_")) {
        const dealId = id.slice("market_claim_".length);
        const deal = deals.get(dealId);

        if (!deal || deal.status !== "waiting_mediator") {
            return interaction.reply({
                content: "❌ هذا الطلب تم استلامه أو لم يعد متاحًا.",
                ephemeral: true
            });
        }

        let member;

        try {
            member = await interaction.guild.members.fetch(
                interaction.user.id
            );
        } catch (error) {
            logError("تعذر جلب بيانات الوسيط", error);

            return interaction.reply({
                content: "❌ لم أستطع التحقق من رتبك. حاول مرة أخرى.",
                ephemeral: true
            });
        }

        if (!isMiddleman(member)) {
            const roleNames = member.roles.cache
                .filter(role => role.id !== interaction.guild.id)
                .map(role => role.name)
                .join(", ");

            return interaction.reply({
                content: `❌ الاستلام مخصص لرتبة **MM Service**.\nالرتب التي أراها: ${roleNames || "لا توجد رتب ظاهرة"}`,
                ephemeral: true
            });
        }

        if (claimedRequests.has(dealId)) {
            return interaction.reply({
                content: "❌ استلم وسيط آخر هذا الطلب.",
                ephemeral: true
            });
        }

        claimedRequests.add(dealId);
        deal.status = "creating";

        try {
            const channel = await createTransactionChannel(
                interaction.guild,
                deal,
                interaction.user.id
            );

            deal.status = "active";

            return interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle("✅ تم استلام الوساطة")
                        .setDescription([
                            `**الوسيط:** <@${interaction.user.id}>`,
                            `**الطرف الأول:** <@${deal.users[0]}>`,
                            `**الطرف الثاني:** <@${deal.users[1]}>`,
                            `**روم الصفقة:** ${channel}`
                        ].join("\n"))
                        .setTimestamp()
                ],
                components: []
            });
        } catch (error) {
            logError("فشل تجهيز صفقة الوساطة", error);

            claimedRequests.delete(dealId);
            deal.status = "waiting_mediator";

            return interaction.reply({
                content: `❌ تعذر تجهيز روم الوساطة. السبب: ${error.message || "خطأ غير معروف"}. راجع سجل البوت.`,
                ephemeral: true
            });
        }
    }

    if (id.startsWith("market_complete_")) {
        const dealId = id.slice("market_complete_".length);
        const deal = deals.get(dealId);

        if (!deal || deal.status !== "active") {
            return interaction.reply({
                content: "❌ الصفقة غير متاحة أو تم إكمالها مسبقًا.",
                ephemeral: true
            });
        }

        const member = interaction.member;

        const allowed =
            deal.users.includes(interaction.user.id) ||
            deal.mediatorId === interaction.user.id ||
            isStaff(member, interaction.guild);

        if (!allowed) {
            return interaction.reply({
                content: "❌ هذا الزر مخصص لأطراف الصفقة والوسيط والإدارة.",
                ephemeral: true
            });
        }

        deal.status = "completed";

        const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle("✅ تم إكمال الصفقة")
            .setDescription([
                `**الطرف الأول:** <@${deal.users[0]}>`,
                `**الطرف الثاني:** <@${deal.users[1]}>`,
                `**الوسيط:** ${deal.mediatorId ? `<@${deal.mediatorId}>` : "بدون وسيط"}`,
                `**تم التأكيد بواسطة:** <@${interaction.user.id}>`,
                "",
                "يمكن إغلاق الروم عند الانتهاء."
            ].join("\n"))
            .setTimestamp();

        return interaction.update({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`market_close_${dealId}`)
                        .setLabel("إغلاق الروم")
                        .setEmoji("🔒")
                        .setStyle(ButtonStyle.Danger)
                )
            ]
        });
    }

    if (id.startsWith("market_close_")) {
        const dealId = id.slice("market_close_".length);
        const deal = deals.get(dealId);

        if (!deal || closingDeals.has(dealId)) {
            return interaction.reply({
                content: "⚠️ يجري إغلاق الروم بالفعل أو لم يتم العثور على الصفقة.",
                ephemeral: true
            });
        }

        const allowed =
            deal.users.includes(interaction.user.id) ||
            deal.mediatorId === interaction.user.id ||
            isStaff(interaction.member, interaction.guild);

        if (!allowed) {
            return interaction.reply({
                content: "❌ لا تملك صلاحية إغلاق هذا الروم.",
                ephemeral: true
            });
        }

        closingDeals.add(dealId);
        deal.status = "closing";

        await interaction.reply({
            content: "🔒 سيتم إغلاق الروم خلال 5 ثوانٍ."
        });

        for (let seconds = 4; seconds >= 1; seconds--) {
            await sleep(1000);

            try {
                await interaction.editReply({
                    content: `🔒 سيتم إغلاق الروم خلال ${seconds} ${seconds === 1 ? "ثانية" : "ثوانٍ"}.`
                });
            } catch {}
        }

        await sleep(1000);

        const channel = interaction.channel;

        deals.delete(dealId);
        claimedRequests.delete(dealId);
        closingDeals.delete(dealId);

        if (channel) {
            await channel.delete("تم إغلاق الصفقة بعد العد التنازلي")
                .catch(error => logError("تعذر حذف روم الصفقة", error));
        }
    }
}

module.exports = {
    commands,
    handleInteraction
};
