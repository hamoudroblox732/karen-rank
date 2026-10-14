
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits
} = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("marketpanel")
    .setDescription("نشر لوحة السوق")
    .addChannelOption(option =>
      option
        .setName("channel")
        .setDescription("الروم اللي تبي تنشر فيه")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "marketpanel") return;

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ الأمر للإدارة فقط.",
      ephemeral: true
    });
  }

  const channel = interaction.options.getChannel("channel");

  const embed = new EmbedBuilder()
    .setColor(0x2B2D31)
    .setTitle("🛒・سوق السيرفر")
    .setDescription(
      "ياهلا بك في سوقنا!\n" +
      "اقرأ الأقسام والقوانين قبل ما تبدأ أي عملية شراء أو بيع."
    )
    .addFields(
      {
        name: "『 🎮 ・ حسابات روبلوكس 』",
        value:
          "لشراء أو بيع حسابات روبلوكس، تواصل مع الإدارة لمعرفة الإجراءات.\n" +
          "⚠️ انتبه: تداول الحسابات قد يخالف شروط Roblox."
      },
      {
        name: "『 🧩 ・ أغراض الألعاب 』",
        value:
          "شراء الأغراض داخل ألعاب ومابات روبلوكس، حسب توفر الغرض وموافقة البائع."
      },
      {
        name: "『 📦 ・ أغراض أخرى 』",
        value:
          "لأي أغراض أو خدمات أخرى مسموح بها، وضّح طلبك واتفق مع الطرف الثاني."
      },
      {
        name: "『 ⚖️ ・ القوانين 』",
        value:
          "1. ممنوع النصب والاحتيال.\n" +
          "2. لا تبدأ أي عملية قبل الاتفاق على التفاصيل والسعر.\n" +
          "3. استخدم وسيطًا معتمدًا من السيرفر قبل فتح روم الصفقة.\n" +
          "4. لا تشارك كلمة المرور أو معلوماتك الخاصة.\n" +
          "5. ممنوع بيع الأشياء المسروقة أو المخالفة للقوانين.\n" +
          "6. احتفظ بإثباتات الاتفاق إلى انتهاء الصفقة."
      },
      {
        name: "『 🤝 ・ طريقة الشراء 』",
        value:
          "اتفق مع البائع أولًا، ثم اطلب وسيطًا معتمدًا وانتظر قبوله.\n" +
          "لا تعتبر الصفقة جاهزة حتى يتم تأكيد الوسيط."
      }
    )
    .setFooter({ text: "MARKET • تعامل بأمان" })
    .setTimestamp();

  try {
    await channel.send({ embeds: [embed] });

    await interaction.reply({
      content: `✅ تم نشر لوحة السوق في ${channel}.`,
      ephemeral: true
    });
  } catch (error) {
    console.error("Market panel error:", error);

    const reply = {
      content: "❌ ما قدرت أنشر اللوحة. تأكد أن البوت يملك صلاحية إرسال الرسائل وتضمين الروابط في الروم.",
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
}

module.exports = {
  commands,
  handleInteraction
};
