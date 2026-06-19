const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const ALLOWED_ROLE_ID = process.env.ALLOWED_ROLE_ID || "1517566561270104165";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

let canGenerate = true;
global.generatorRunning = false;
global.stopGenerator = false;

const folderName = 'savedA';
const ROBLOX_CREATE_URL = 'https://www.roblox.com/CreateAccount';

if (!fs.existsSync(folderName)) fs.mkdirSync(folderName);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const colors = { green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m', reset: '\x1b[0m' };

const genCooldowns = new Map();

function getCooldownDuration(member) {
    const roles = member.roles.cache;
    if (roles.has('1517562867438715161')) return 1 * 60 * 1000;
    if (roles.has('1517561220754964580')) return 10 * 60 * 1000;
    if (roles.has('1517561007289929878')) return 60 * 60 * 1000;
    return 60 * 60 * 1000;
}

function checkCooldown(userId, member) {
    const now = Date.now();
    const cooldownMs = getCooldownDuration(member);
    const lastUsed = genCooldowns.get(userId);
    if (lastUsed && now - lastUsed < cooldownMs) {
        const remaining = Math.ceil((cooldownMs - (now - lastUsed)) / 1000 / 60);
        return { onCooldown: true, remainingMinutes: remaining };
    }
    return { onCooldown: false };
}

const USE_HEADLESS = true;
const BATCH_SIZE = 3;

function randomBirthday() {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const year = Math.floor(Math.random() * (2010 - 1995 + 1)) + 1995;
    const month = months[Math.floor(Math.random() * months.length)];
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    return { month, day, year: year.toString(), display: `${month} ${day}, ${year}` };
}

function saveAccount(username, password, birthday, cookie, userId) {
    const data = {
        Name: username,
        Password: password,
        Birthday: birthday.display,
        Cookie: cookie || "NOT_CAPTURED",
        UserID: userId || "NOT_CREATED",
        ProfileLink: userId ? `https://www.roblox.com/users/${userId}/profile` : "NOT_CREATED",
        Created: new Date().toISOString()
    };
    fs.writeFileSync(path.join(folderName, `${username}.json`), JSON.stringify(data, null, 4));
    console.log(`${colors.green}[SAVED] ${username}.json${colors.reset}`);
}

async function getUserId(username) {
    try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username] })
        });
        const data = await res.json();
        return data.data?.[0]?.id || null;
    } catch { return null; }
}

async function hasStartPuzzle(page) {
    if (await page.locator('button[aria-label="Start Puzzle"]').count() > 0) return true;
    for (const frame of page.frames()) {
        try { if (await frame.locator('button[aria-label="Start Puzzle"]').count() > 0) return true; } catch {}
    }
    return false;
}

async function safeGoto(page, url) {
    for (let i = 0; i < 5; i++) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await sleep(3000);
            return true;
        } catch (e) {
            await sleep(5000);
        }
    }
    return false;
}

function generateUsername() {
    const length = Math.floor(Math.random() * 11) + 8;
    let username = '';
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < length; i++) username += chars[Math.floor(Math.random() * chars.length)];
    if (Math.random() > 0.6) username += String(Math.floor(Math.random() * 900) + 100);
    if (username.length < 8) username += 'x'.repeat(8 - username.length);
    if (username.length > 18) username = username.slice(0, 18);
    if (/^\d/.test(username)) username = 'x' + username.slice(1);
    return username;
}

function generatePassword(username) {
    const num = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 10000;
    return `Generated$Akena${num.toString().padStart(4, '0')}`;
}

async function waitForSignupButton(page, timeout = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const isEnabled = await page.evaluate(() => {
            const btn = document.getElementById('signup-button');
            return btn && !btn.disabled && btn.offsetParent !== null;
        });
        if (isEnabled) return true;
        await sleep(800);
    }
    return false;
}

async function createSingleAccount(batchIndex, totalInBatch) {
    let username = generateUsername();
    let password = generatePassword(username);

    let isFree = false;
    try {
        const res = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [username] })
        });
        const data = await res.json();
        isFree = !data.data || data.data.length === 0;
    } catch {}

    if (!isFree) {
        console.log(`${colors.red}[TAKEN] ${username}${colors.reset}`);
        return false;
    }

    console.log(`${colors.green}[${batchIndex + 1}/${totalInBatch}] [VALID] ${username} -> Launching...${colors.reset}`);

    let browser;
    try {
        browser = await chromium.launch({
            headless: USE_HEADLESS,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--no-first-run'
            ]
        });

        const context = await browser.newContext({
            viewport: { width: 920, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();

        await safeGoto(page, ROBLOX_CREATE_URL);
        await sleep(4000);

        const birthday = randomBirthday();

        await page.selectOption('#MonthDropdown', birthday.month);
        await sleep(1200);
        await page.selectOption('#DayDropdown', birthday.day);
        await sleep(1200);
        await page.selectOption('#YearDropdown', birthday.year);
        await sleep(2000);

        await page.fill('#signup-username', username);
        await sleep(1500);
        await page.fill('#signup-password', password);
        await sleep(1800);

        const buttonReady = await waitForSignupButton(page, 25000);
        if (!buttonReady) {
            console.log(`${colors.red}[${batchIndex + 1}/${totalInBatch}] Button not enabled -> Skipping${colors.reset}`);
            return false;
        }

        await page.click('#signup-button');

        for (let i = 0; i < 80; i++) {
            await sleep(1600);

            if (await page.locator('text=Username not appropriate for Roblox').count() > 0) break;
            if (await page.locator('text=Sorry! An unknown error occurred').count() > 0) break;
            if (await hasStartPuzzle(page)) break;

            if (page.url().includes('/home') || page.url().includes('/dashboard')) {
                const userId = await getUserId(username);
                const cookies = await context.cookies();
                const robloCookie = cookies.find(c => c.name === '.ROBLOSECURITY');
                
                saveAccount(username, password, birthday, robloCookie?.value, userId);
                return true;
            }
        }
    } catch (err) {
        console.log(`${colors.red}[${batchIndex + 1}/${totalInBatch}] Error: ${err.message.split('\n')[0]}${colors.reset}`);
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
    return false;
}

async function startGenerator() {
    console.log(`Generator started | Batch: ${BATCH_SIZE} | Running until stopped`);

    global.stopGenerator = false;
    let totalCreated = 0;

    while (true) {
        if (global.stopGenerator) break;

        console.log(`Starting new batch of ${BATCH_SIZE} accounts...`);

        const batchPromises = [];
        let batchCreated = 0;

        for (let i = 0; i < BATCH_SIZE; i++) {
            batchPromises.push(createSingleAccount(i, BATCH_SIZE).then(success => {
                if (success) batchCreated++;
            }));
        }

        await Promise.all(batchPromises);
        totalCreated += batchCreated;

        console.log(`Batch finished | ${batchCreated}/${BATCH_SIZE} | Total: ${totalCreated}\n`);
        await sleep(3500);
    }

    global.generatorRunning = false;
    console.log(`Generator stopped. Total created: ${totalCreated}`);
};

client.once('ready', async () => {
    console.log(`Bot Ready - ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder().setName('stock').setDescription('Start infinite generator'),
        new SlashCommandBuilder().setName('gen').setDescription('Get oldest account (1+ days old)'),
        new SlashCommandBuilder().setName('stockcount').setDescription('Show total number of accounts in stock'),
        new SlashCommandBuilder().setName('option').setDescription('Filter accounts by age'),
        new SlashCommandBuilder().setName('settings').setDescription('Enable / Disable generation'),
        new SlashCommandBuilder().setName('stopstocking').setDescription('Stop the generator')
    ];

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);

    if (interaction.commandName === 'stock') {
        if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        await interaction.reply({ content: `Infinite generator started (batches of ${BATCH_SIZE}). Use /stopstocking to stop.`, ephemeral: true });

        if (!global.generatorRunning) {
            global.generatorRunning = true;
            startGenerator().catch(console.error);
        }
    }

    if (interaction.commandName === 'stockcount') {
        await interaction.deferReply({ ephemeral: true });
        const files = fs.readdirSync(folderName).filter(f => f.endsWith('.json'));
        const total = files.length;

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('Stock Count')
            .setDescription(`Total Accounts in Stock: ${total}`)
            .setFooter({ text: 'Bleach Hack' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }

    if (interaction.commandName === 'gen') {
        await interaction.deferReply({ ephemeral: true });

        if (!member) return interaction.editReply({ content: 'Error fetching member.' });

        const cooldownCheck = checkCooldown(interaction.user.id, member);
        if (cooldownCheck.onCooldown) {
            return interaction.editReply({ content: `You are on cooldown. Try again in ${cooldownCheck.remainingMinutes} minutes.` });
        }

        genCooldowns.set(interaction.user.id, Date.now());

        const files = fs.readdirSync(folderName).filter(f => f.endsWith('.json'));
        if (files.length === 0) return interaction.editReply({ content: 'No accounts in stock.' });

        const now = Date.now();
        const eligible = [];

        for (const file of files) {
            try {
                const filePath = path.join(folderName, file);
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const created = new Date(data.Created);
                const ageDays = (now - created) / (1000 * 60 * 60 * 24);

                if (ageDays >= 1) eligible.push({ data, filePath, created });
            } catch (e) {
                try { fs.unlinkSync(path.join(folderName, file)); } catch {}
            }
        }

        if (eligible.length === 0) return interaction.editReply({ content: 'No accounts older than 1 day available.' });

        eligible.sort((a, b) => a.created - b.created);
        const oldestEntry = eligible[0];
        const data = oldestEntry.data;

        const pfp = data.UserID && data.UserID !== "NOT_CREATED" 
            ? `https://www.roblox.com/headshot-thumbnail/image?userId=${data.UserID}&width=420&height=420&format=png` 
            : null;

        const embed = new EmbedBuilder()
            .setColor(0x9B59B6)
            .setTitle('Your Roblox Alt Account')
            .setThumbnail(pfp)
            .addFields(
                { name: 'Username', value: `\`${data.Name || 'N/A'}\``, inline: true },
                { name: 'Password', value: `\`${data.Password || 'N/A'}\``, inline: true },
                { name: 'Birthday', value: data.Birthday || 'N/A', inline: true },
                { name: 'UserID', value: String(data.UserID || 'N/A'), inline: true },
                { name: 'Created On', value: new Date(data.Created).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }), inline: true },
                { name: 'Profile', value: data.ProfileLink || 'N/A', inline: false }
            )
            .setFooter({ text: 'Bleach Hack' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        try { await interaction.user.send({ embeds: [embed] }); } catch {}
        fs.unlinkSync(oldestEntry.filePath);
    }

    if (interaction.commandName === 'option') {
        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('age_filter')
                .setPlaceholder('Select account age...')
                .addOptions([
                    { label: 'Today', value: 'today' },
                    { label: '1 Day', value: '1day' },
                    { label: '2 Days', value: '2days' },
                    { label: '3 Days', value: '3days' },
                    { label: 'More than 3 Days', value: 'more' }
                ])
        );
        await interaction.reply({ content: 'Filter accounts by creation date:', components: [row], ephemeral: true });
    }

    if (interaction.commandName === 'settings') {
        if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('enable_gen').setLabel('Enable Generate').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('disable_gen').setLabel('Disable Generate').setStyle(ButtonStyle.Danger)
        );

        await interaction.reply({ content: `Generation Settings\nCurrent: ${canGenerate ? 'Enabled' : 'Disabled'}`, components: [row], ephemeral: true });
    }

    if (interaction.commandName === 'stopstocking') {
        if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) {
            return interaction.reply({ content: 'No permission.', ephemeral: true });
        }
        if (!global.generatorRunning) return interaction.reply({ content: 'No generator running.', ephemeral: true });

        global.stopGenerator = true;
        await interaction.reply({ content: 'Stop command sent.', ephemeral: true });
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton() && (interaction.customId === 'enable_gen' || interaction.customId === 'disable_gen')) {
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        if (!member || !member.roles.cache.has(ALLOWED_ROLE_ID)) return;
        canGenerate = interaction.customId === 'enable_gen';
        await interaction.update({ content: `Settings Updated\nGeneration is now ${canGenerate ? 'Enabled' : 'Disabled'}`, components: [] });
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'age_filter') return;

    const files = fs.readdirSync(folderName).filter(f => f.endsWith('.json'));
    const now = Date.now();
    const filtered = [];

    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(folderName, file), 'utf8'));
            const created = new Date(data.Created);
            const ageDays = (now - created) / (1000 * 60 * 60 * 24);

            if (interaction.values[0] === 'today' && ageDays < 1) filtered.push(data);
            else if (interaction.values[0] === '1day' && ageDays >= 1 && ageDays < 2) filtered.push(data);
            else if (interaction.values[0] === '2days' && ageDays >= 2 && ageDays < 3) filtered.push(data);
            else if (interaction.values[0] === '3days' && ageDays >= 3 && ageDays < 4) filtered.push(data);
            else if (interaction.values[0] === 'more' && ageDays >= 4) filtered.push(data);
        } catch {}
    }

    if (filtered.length === 0) return interaction.update({ content: 'No accounts match this filter.', components: [] });

    const randomAccount = filtered[Math.floor(Math.random() * filtered.length)];

    const pfp = randomAccount.UserID && randomAccount.UserID !== "NOT_CREATED" 
        ? `https://www.roblox.com/headshot-thumbnail/image?userId=${randomAccount.UserID}&width=420&height=420&format=png` 
        : null;

    const embed = new EmbedBuilder()
        .setColor(0xEBAFCC)
        .setTitle('Filtered Account')
        .setThumbnail(pfp)
        .addFields(
            { name: 'Username', value: `\`${randomAccount.Name || 'N/A'}\``, inline: true },
            { name: 'Password', value: `\`${randomAccount.Password || 'N/A'}\``, inline: true },
            { name: 'Birthday', value: String(randomAccount.Birthday || 'N/A'), inline: true }
        )
        .setFooter({ text: 'Bleach Hack' })
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
    try { await interaction.user.send({ embeds: [embed] }); } catch (e) {}
});

client.login(DISCORD_TOKEN);
