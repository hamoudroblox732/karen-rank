const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits
} = require("discord.js");

const ADMIN_ROLE_ID = "1554456128472219770";
const MIDDLEMAN_ROLE_ID = "1559877945441648773";
const OWNER_ROLE_ID = "1554456245329596486";

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

function isStaff(member) {
    return member.roles.cache.has(ADMIN_ROLE_ID) ||
        member.roles.cache.has(OWNER_ROLE_ID);
}

function isMiddleman(member) {
    return member.roles.cache.has(MIDDLEMAN_ROLE_ID);
}

function categoryName(id) {
    return categories.find(c => c.id === id)?.label || "عملية شراء وبيع";
}

function makeCategoryRows() {
    const rows = [];

    for (let i = 0; i < categories.length; i += 3) {
        const row = new ActionRowBuilder();

        categories.slice(i, i + 3).forEach(category => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`market_category_${category.id}`)
                    .setLabel(category.label)
                    .setEmoji(category.emoji)
                    .setStyle(ButtonStyle.Primary)
            );
        });

        rows.push(row);
    }

    return rows;
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

function transactionRulesEmbed(deal, mediator) {
    return new EmbedBuilder()
        .setColor(mediator ? 0x3498DB : 0x2ECC71)
        .setTitle(mediator ? "🛡️ غرفة وساطة رسمية" : "🤝 غرفة البيع والشراء")
        .setDescription(
            [
                "أهلًا بكم في غرفة إتمام الصفقة!",
                "",
                `**نوع الصفقة:** ${categoryName(deal.category)}`,
                `**الطرف الأول:** <@${deal.users[0]}>`,
                `**الطرف الثاني:** <@${deal.users[1]}>`,
                `**الوسيط:** ${mediator ? `<@${mediator}>` : "بدون وسيط"}`,
                "",
                "━━━━━━━━━━━━━━━━━━",
                "📜 **القوانين والتعليمات**",
                "",
                "1. اتفقوا على جميع التفاصيل قبل إتمام الصفقة.",
                "2. يمنع الاحتيال أو انتحال شخصية أي شخص.",
                "3. لا تشاركوا كلمات المرور أو المعلومات الشخصية.",
                "4. احتفظوا بإثباتات الاتفاق والعملية عند الحاجة.",
                "5. لا تضغطوا على زر إكمال الشراء إلا بعد التأكد من إتمام الصفقة.",
                "6. عند وجود مشكلة، تواصلوا مع الإدارة داخل الروم.",
                mediator
                    ? "7. الوسيط يساعد في تنظيم الصفقة، ولا تشاركوا معلومات حساباتكم السرية."
                    : "7. هذه الصفقة بدون وسيط؛ تأكدوا من الطرف الآخر قبل المتابعة.",
                "",
                "━━━━━━━━━━━━━━━━━━",
                "اضغطوا **تم إكمال الشراء** بعد انتهاء الصفقة، أو **إغلاق الروم** لإنهاء الغرفة."
            ].join("\n")
        )
        .setFooter({ text: "Karen Rank • نظام البيع والشراء" })
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
    const overwrites = [
        {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel]
        },
        {
            id: deal.users[0],
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        {
            id: deal.users[1],
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        }
    ];

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

    for (const roleId of [ADMIN_ROLE_ID, OWNER_ROLE_ID]) {
        overwrites.push({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.ManageMessages
            ]
        });
    }

    const channel = await guild.channels.create({
        name: `deal-${deal.users[0].slice(-4)}-${deal.users[1].slice(-4)}`,
        type: ChannelType.GuildText,
        topic: `صفقة ${deal.id} | ${categoryName(deal.category)}`,
        permissionOverwrites: overwrites
    });

    deal.channelId = channel.id;
    deal.mediatorId = mediatorId;
    deals.set(deal.id, deal);

    const embed = transactionRulesEmbed(deal, mediatorId);

    await channel.send({
        content: [
            `<@${deal.users[0]}>`,
            `<@${deal.users[1]}>`,
            mediatorId ? `<@${mediatorId}>` : null,
            `<@&${ADMIN_ROLE_ID}>`,
            `<@&${OWNER_ROLE_ID}>`
        ].filter(Boolean).join(" "),
        embeds: [embed],
        components: [transactionButtons(deal.id)],
        allowedMentions: {
            users: [...deal.users, ...(mediatorId ? [mediatorId] : [])],
            roles: [ADMIN_ROLE_ID, OWNER_ROLE_ID]
        }
    });

    return channel;
}

async function postMediatorRequest(guild, deal) {
    if (!middlemanChannelId) {
        return null;
    }

    const channel = guild.channels.cache.get(middlemanChannelId);

    if (!channel || !channel.isTextBased()) {
        return null;
    }

    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle("🛡️ طلب وساطة جديد")
        .setDescription(
            [
                "يوجد طلب وساطة جديد يحتاج إلى وسيط.",
                "",
                `**نوع الصفقة:** ${categoryName(deal.category)}`,
                `**الطرف الأول:** <@${deal.users[0]}>`,
                `**الطرف الثاني:** <@${deal.users[1]}>`,
                "",
                "على أحد الوسطاء الضغط على زر **استلام الوساطة**.",
                "بعد الاستلام، ستُفتح غرفة خاصة بالوسيط والطرفين والإدارة."
            ].join("\n")
        )
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
        content: `<@&${MIDDLEMAN_ROLE_ID}>`,
        embeds: [embed],
        components: [row],
        allowedMentions: { roles: [MIDDLEMAN_ROLE_ID] }
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
                .setDescription("روم طلبات الوساطة")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "marketpanel") {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: "❌ هذا الأمر للإدارة فقط.",
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle("🛍️ سوق البيع والشراء")
                .setDescription(
                    [
                        "اختر نوع العملية التي تريد الدخول فيها.",
                        "",
                        "• اختر نفس نوع الصفقة الذي يختاره الطرف الآخر.",
                        "• بعد المطابقة، اختاروا مع وسيط أو بدون وسيط.",
                        "• لا تشاركوا معلوماتكم السرية مع أي شخص.",
                        "",
                        "**اختر نوع الصفقة من الأزرار بالأسفل:**"
                    ].join("\n")
                )
                .setFooter({ text: "Karen Rank • Market" });

            return interaction.reply({
                embeds: [embed],
                components: makeCategoryRows()
            });
        }

        if (interaction.commandName === "setmiddlemanchannel") {
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({
                    content: "❌ هذا الأمر للإدارة فقط.",
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel("channel");
            middlemanChannelId = channel.id;

            return interaction.reply({
                content: `✅ تم تحديد روم طلبات الوساطة: ${channel}`,
                ephemeral: true
            });
        }
    }

    if (!interaction.isButton()) return;

    const id = interaction.customId;

    if (id.startsWith("market_category_")) {
        const category = id.replace("market_category_", "");
        const userId = interaction.user.id;

        if (queues.get(category)?.some(item => item.userId === userId)) {
            return interaction.reply({
                content: "⚠️ أنت بالفعل في قائمة انتظار هذا النوع.",
                ephemeral: true
            });
        }

        const queue = queues.get(category) || [];
        const other = queue.find(item => item.userId !== userId);

        if (!other) {
            queue.push({
                userId,
                interaction
            });

            queues.set(category, queue);

            return interaction.reply({
                content: "⏳ تمت إضافتك لقائمة الانتظار. سيتم تنبيهك عند العثور على الطرف الآخر.",
                ephemeral: true
            });
        }

        queues.set(
            category,
            queue.filter(item => item.userId !== other.userId)
        );

        const dealId = `${Date.now()}_${other.userId}_${userId}`;

        const deal = {
            id: dealId,
            category,
            users: [other.userId, userId],
            choices: new Map(),
            status: "choosing"
        };

        deals.set(dealId, deal);

        const choiceMessage = {
            content: "🤝 تمت مطابقتك! اختاروا هل تريدون إتمام الصفقة مع وسيط أو بدونه.",
            components: [mediatorChoiceRow(dealId)]
        };

        try {
            await other.interaction.followUp({
                ...choiceMessage,
                ephemeral: true
            });
        } catch (error) {
            console.error("Could not send choice to first user:", error);
        }

        return interaction.reply({
            ...choiceMessage,
            ephemeral: true
        });
    }

    if (id.startsWith("market_mediator_yes_") ||
        id.startsWith("market_mediator_no_")) {
        const useMediator = id.startsWith("market_mediator_yes_");
        const dealId = id.replace(
            useMediator ? "market_mediator_yes_" : "market_mediator_no_",
            ""
        );

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
                content: "⚠️ لقد اخترت بالفعل.",
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
            deal.status = "choice_mismatch";

            for (const userId of deal.users) {
                try {
                    await interaction.followUp({
                        content: `⚠️ اختيارات الطرفين مختلفة. أُلغيت هذه المطابقة؛ ارجع إلى لوحة السوق وحاول مرة أخرى.`,
                        ephemeral: true
                    });
                    break;
                } catch {}
            }

            deals.delete(dealId);
            return;
        }

        if (choices[0] === true) {
            deal.status = "waiting_mediator";

            const requestMessage = await postMediatorRequest(
                interaction.guild,
                deal
            );

            if (!requestMessage) {
                deal.status = "choosing";

                return interaction.followUp({
                    content: "❌ لم يتم إعداد روم الوساطة أو أن الروم غير متاح. على الإدارة استخدام `/setmiddlemanchannel` أولًا.",
                    ephemeral: true
                });
            }

            return;
        }

        deal.status = "creating";

        try {
            const channel = await createTransactionChannel(
                interaction.guild,
                deal,
                null
            );

            deal.status = "active";

            await interaction.followUp({
                content: `✅ تم فتح روم الصفقة بدون وسيط: ${channel}`,
                ephemeral: true
            });
        } catch (error) {
            console.error("Could not create transaction channel:", error);

            deals.delete(dealId);

            await interaction.followUp({
                content: "❌ تعذر فتح الروم. تأكد أن البوت لديه صلاحية إدارة القنوات.",
                ephemeral: true
            });
        }

        return;
    }

    if (id.startsWith("market_claim_")) {
        const dealId = id.replace("market_claim_", "");
        const deal = deals.get(dealId);

        if (!deal || deal.status !== "waiting_mediator") {
            return interaction.reply({
                content: "❌ هذا الطلب تم استلامه أو لم يعد متاحًا.",
                ephemeral: true
            });
        }

        if (!isMiddleman(interaction.member)) {
            return interaction.reply({
                content: "❌ زر الاستلام مخصص للوسطاء فقط.",
                ephemeral: true
            });
        }

        if (claimedRequests.has(dealId)) {
            return interaction.reply({
                content: "❌ استلم وسيط آخر هذا الطلب بالفعل.",
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

            await interaction.update({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0x2ECC71)
                        .setTitle("✅ تم استلام الوساطة")
                        .setDescription(
                            [
                                `**الوسيط:** ${interaction.user}`,
                                `**الطرف الأول:** <@${deal.users[0]}>`,
                                `**الطرف الثاني:** <@${deal.users[1]}>`,
                                "",
                                `**روم الصفقة:** ${channel}`
                            ].join("\n")
                        )
                        .setTimestamp()
                ],
                components: []
            });

            for (const userId of deal.users) {
                try {
                    await interaction.guild.members.fetch(userId);
                } catch {}
            }
        } catch (error) {
            console.error("Could not create mediated channel:", error);

            claimedRequests.delete(dealId);
            deal.status = "waiting_mediator";

            return interaction.reply({
                content: "❌ تعذر فتح الروم. تأكد أن البوت لديه صلاحية إدارة القنوات.",
                ephemeral: true
            });
        }

        return;
    }

    if (id.startsWith("market_complete_")) {
        const dealId = id.replace("market_complete_", "");
        const deal = deals.get(dealId);

        if (!deal || deal.status !== "active") {
            return interaction.reply({
                content: "❌ الصفقة غير متاحة أو تم إكمالها مسبقًا.",
                ephemeral: true
            });
        }

        const allowed =
            deal.users.includes(interaction.user.id) ||
            deal.mediatorId === interaction.user.id ||
            isStaff(interaction.member);

        if (!allowed) {
            return interaction.reply({
                content: "❌ هذا الزر مخصص لأطراف الصفقة والإدارة.",
                ephemeral: true
            });
        }

        deal.status = "completed";

        const completedEmbed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle("✅ تم إكمال الصفقة")
            .setDescription(
                [
                    `**الطرف الأول:** <@${deal.users[0]}>`,
                    `**الطرف الثاني:** <@${deal.users[1]}>`,
                    `**الوسيط:** ${deal.mediatorId ? `<@${deal.mediatorId}>` : "بدون وسيط"}`,
                    `**تم التأكيد بواسطة:** ${interaction.user}`,
                    "",
                    "تم تسجيل الصفقة كمكتملة. يمكن للإدارة إغلاق الروم عند الانتهاء."
                ].join("\n")
            )
            .setTimestamp();

        await interaction.update({
            embeds: [completedEmbed],
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

        return;
    }

    if (id.startsWith("market_close_")) {
        const dealId = id.replace("market_close_", "");
        const deal = deals.get(dealId);

        if (!deal) {
            return interaction.reply({
                content: "❌ لم يتم العثور على بيانات هذه الصفقة.",
                ephemeral: true
            });
        }

        const allowed =
            deal.users.includes(interaction.user.id) ||
            deal.mediatorId === interaction.user.id ||
            isStaff(interaction.member);

        if (!allowed) {
            return interaction.reply({
                content: "❌ لا تملك صلاحية إغلاق هذا الروم.",
                ephemeral: true
            });
        }

        await interaction.reply({
            content: "🔒 سيتم إغلاق روم الصفقة...",
            ephemeral: true
        });

        const channel = interaction.guild.channels.cache.get(deal.channelId);

        deals.delete(dealId);
        claimedRequests.delete(dealId);

        if (channel) {
            await channel.delete("تم إغلاق روم الصفقة").catch(console.error);
        }

        return;
    }
}

module.exports = {
    commands,
    handleInteraction
};
