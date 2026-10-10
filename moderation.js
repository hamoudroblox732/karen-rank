const fs = require("fs");
const path = require("path");
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require("discord.js");
const warningsFile = path.join(__dirname, "warnings.json");
function loadWarnings() {
  try {
    if (!fs.existsSync(warningsFile)) {
      fs.writeFileSync(warningsFile, "{}", "utf8");
    }
    const data = JSON.parse(
      fs.readFileSync(warningsFile, "utf8")
    );
    return data && typeof data === "object" && !Array.isArray(data)
      ? data
      : {};
  } catch (error) {
    console.error("WARNINGS LOAD ERROR:", error);
    return {};
  }
}
let warnings = loadWarnings();
function saveWarnings() {
  const temporaryFile = `${warningsFile}.tmp`;
  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(warnings, null, 2),
    "utf8"
  );
  fs.renameSync(temporaryFile, warningsFile);
}
function isOwner(interaction) {
  return Boolean(
    interaction.guild &&
    interaction.user.id === interaction.guild.ownerId
  );
}
function canModerate(interaction) {
  return Boolean(
    interaction.guild &&
    (
      isOwner(interaction) ||
      interaction.memberPermissions?.has(
        PermissionsBitField.Flags.Administrator
      )
    )
  );
}
function getMemberWarnings(guildId, userId) {
  if (!warnings[guildId]) {
    warnings[guildId] = {};
  }
  if (!Array.isArray(warnings[guildId][userId])) {
    warnings[guildId][userId] = [];
  }
  return warnings[guildId][userId];
}
const commands = [
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a server member")
    .addUserOption(option =>
      option
        .setName("mention")
        .setDescription("Member to warn")
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for the warning")
        .setRequired(true)
        .setMaxLength(1000)
    ),
  new SlashCommandBuilder()
    .setName("warnr")
    .setDescription("Remove warnings")
    .addUserOption(option =>
      option
        .setName("mention")
        .setDescription("Member whose warnings to remove")
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option
        .setName("all")
        .setDescription("Remove warnings from everyone")
        .setRequired(false)
    )
].map(command => command.toJSON());
async function handleInteraction(interaction) {
  if (
    interaction.isChatInputCommand() &&
    ["warn", "warnr"].includes(interaction.commandName)
  ) {
    if (!canModerate(interaction)) {
      await interaction.reply({
        content: "❌ هذا الأمر للـ Admin وOwner فقط.",
        ephemeral: true
      });
      return true;
    }
    if (interaction.commandName === "warn") {
      const target = interaction.options.getUser("mention", true);
      const reason = interaction.options.getString("reason", true);
      if (
        target.bot ||
        target.id === interaction.user.id ||
        target.id === interaction.guild.ownerId
      ) {
        await interaction.reply({
          content: "❌ لا يمكن تحذير هذا العضو.",
          ephemeral: true
        });
        return true;
      }
      const member = await interaction.guild.members
        .fetch(target.id)
        .catch(() => null);
      if (!member) {
        await interaction.reply({
          content: "❌ العضو غير موجود في السيرفر.",
          ephemeral: true
        });
        return true;
      }
      const memberWarnings = getMemberWarnings(
        interaction.guild.id,
        target.id
      );
      memberWarnings.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        reason,
        moderatorId: interaction.user.id,
        timestamp: new Date().toISOString()
      });
      try {
        saveWarnings();
      } catch (error) {
        memberWarnings.pop();
        console.error("WARNING SAVE ERROR:", error);
        await interaction.reply({
          content: "❌ تعذر حفظ التحذير.",
          ephemeral: true
        });
        return true;
      }
      const embed = new EmbedBuilder()
        .setTitle("MEMBER WARNING")
        .setColor(0xed4245)
        .setDescription(
          `**Member:** <@${target.id}>\n` +
          `**Moderator:** <@${interaction.user.id}>\n` +
          `**Reason:** ${reason}\n` +
          `**Total warnings:** ${memberWarnings.length}`
        )
        .setTimestamp();
      await interaction.reply({
        embeds: [embed],
        allowedMentions: {
          users: [target.id, interaction.user.id]
        }
      });
      return true;
    }
    const target = interaction.options.getUser("mention");
    const removeAll = interaction.options.getBoolean("all") ?? false;
    if (Boolean(target) === removeAll) {
      await interaction.reply({
        content:
          "❌ اختر `mention` لعضو محدد، أو اجعل `all` = `True` لمسح الكل.",
        ephemeral: true
      });
      return true;
    }
    const guildId = interaction.guild.id;
    if (removeAll) {
      const total = Object.values(warnings[guildId] || {})
        .reduce(
          (sum, list) =>
            sum + (Array.isArray(list) ? list.length : 0),
          0
        );
      if (total === 0) {
        await interaction.reply({
          content: "✅ ما فيه تحذيرات محفوظة.",
          ephemeral: true
        });
        return true;
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`warnr_confirm_${interaction.user.id}`)
          .setLabel("تأكيد مسح الكل")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`warnr_cancel_${interaction.user.id}`)
          .setLabel("إلغاء")
          .setStyle(ButtonStyle.Secondary)
      );
      await interaction.reply({
        content:
          `⚠️ **تأكيد مسح جميع التحذيرات**\n` +
          `عدد التحذيرات: **${total}**\n` +
          `لا يمكن التراجع عن هذا الإجراء.`,
        components: [row],
        ephemeral: true
      });
      return true;
    }
    if (target.bot) {
      await interaction.reply({
        content: "❌ ما تقدر تمسح تحذيرات بوت.",
        ephemeral: true
      });
      return true;
    }
    const memberWarnings = getMemberWarnings(guildId, target.id);
    const removed = memberWarnings.length;
    if (removed === 0) {
      await interaction.reply({
        content: `ℹ️ <@${target.id}> ما عنده تحذيرات.`,
        ephemeral: true,
        allowedMentions: { users: [] }
      });
      return true;
    }
    warnings[guildId][target.id] = [];
    try {
      saveWarnings();
    } catch (error) {
      warnings[guildId][target.id] = memberWarnings;
      console.error("WARNING REMOVAL ERROR:", error);
      await interaction.reply({
        content: "❌ تعذر حفظ التغييرات.",
        ephemeral: true
      });
      return true;
    }
    await interaction.reply({
      content:
        `✅ تمت إزالة تحذيرات <@${target.id}>\n` +
        `عدد التحذيرات المحذوفة: **${removed}**.`,
      ephemeral: true,
      allowedMentions: { users: [] }
    });
    return true;
  }
  if (
    interaction.isButton() &&
    (
      interaction.customId.startsWith("warnr_confirm_") ||
      interaction.customId.startsWith("warnr_cancel_")
    )
  ) {
    const confirming = interaction.customId.startsWith("warnr_confirm_");
    const prefix = confirming ? "warnr_confirm_" : "warnr_cancel_";
    const ownerId = interaction.customId.slice(prefix.length);
    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: "❌ هذا التأكيد مخصص للشخص الذي طلبه.",
        ephemeral: true
      });
      return true;
    }
    if (!canModerate(interaction)) {
      await interaction.reply({
        content: "❌ ما عندك صلاحية تنفيذ هذا الإجراء.",
        ephemeral: true
      });
      return true;
    }
    if (!confirming) {
      await interaction.update({
        content: "✅ تم إلغاء العملية.",
        components: []
      });
      return true;
    }
    const guildId = interaction.guild.id;
    const previousWarnings = warnings[guildId] || {};
    const removed = Object.values(previousWarnings).reduce(
      (sum, list) =>
        sum + (Array.isArray(list) ? list.length : 0),
      0
    );
    warnings[guildId] = {};
    try {
      saveWarnings();
    } catch (error) {
      warnings[guildId] = previousWarnings;
      console.error("CLEAR WARNINGS ERROR:", error);
      await interaction.update({
        content: "❌ تعذر حفظ التغييرات.",
        components: []
      });
      return true;
    }
    await interaction.update({
      content: `✅ تم مسح جميع التحذيرات. العدد: **${removed}**.`,
      components: []
    });
    return true;
  }
  return false;
}
module.exports = {
  commands,
  handleInteraction
};
