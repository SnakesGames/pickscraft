// Pickscraft Network - Privacy Policy and Terms of Service.
// Shown on the website at #/privacy and #/terms, and linked from the game's login screen and settings.
//
// KEEP THESE UP TO DATE: whenever the game or website starts collecting new information, adds a new service provider,
// changes who can see something, or changes the rules (Tokens, rooms, age limit...), edit the text below,
// bump LEGAL.updated, and if the change is big, bump LEGAL.version too (new sign-ups record the version they agreed to).

export const LEGAL = {
  version: '1.0',
  updated: 'October 20, 2026',
  name: 'Pickscraft Network',
  site: 'www.pickscraft.net',
  // Fill these in before you publish:
  contact: '',          // e.g. 'support@pickscraft.net' - where people send privacy requests and questions
  law: '',              // e.g. 'the State of New York, USA' - whose laws govern the Terms
  minAge: 13
};

const contact = () => LEGAL.contact
  ? `<a href="mailto:${LEGAL.contact}">${LEGAL.contact}</a>`
  : '<mark>[add your contact email in public/legal.js]</mark>';

export function privacyHtml() {
  const c = contact();
  return `
<h1>Privacy Policy</h1>
<p class="hint">Version ${LEGAL.version} &middot; Last updated ${LEGAL.updated}</p>

<p>This policy explains what information ${LEGAL.name} (the game, the Pickscraft launcher, and the website at ${LEGAL.site},
together "the Service") collects, how it is used, who can see it, and the choices you have. We wrote it in plain language.
If anything is unclear, contact us at ${c}.</p>

<h2>The short version</h2>
<ul>
  <li>We collect what we need to run your account and let you play with others: your email, username, profile, friends, rooms and game progress.</li>
  <li>We do <b>not</b> sell your information, show ads, or use advertising trackers.</li>
  <li>In-game chat is sent live to the other players in your room. We do not store chat on our servers.</li>
  <li>The Service is not for children under ${LEGAL.minAge}.</li>
  <li>You can ask us to see, fix or delete your information at any time.</li>
</ul>

<h2>1. Information you give us</h2>
<ul>
  <li><b>Account:</b> your email address, username and password. Passwords are handled by our login provider (Supabase Auth)
    and are stored only as a secure hash. We never see or store your password in readable form.</li>
  <li><b>Profile:</b> your display name, bio, avatar and shirt colours, and your avatar outfit.</li>
  <li><b>Things you make:</b> Maker rooms (the pieces, CV3 chips and wires in them), room names, descriptions and settings,
    whether a room is public or private, and the co-owners you add.</li>
  <li><b>Social activity:</b> friend requests, your friends list, room invites you send and receive, and likes or dislikes you give rooms.</li>
  <li><b>Messages to us:</b> anything you send when you contact us.</li>
</ul>

<h2>2. Information collected when you play</h2>
<ul>
  <li><b>Game progress:</b> your level, XP, and Tokens (our in-game currency), gifts of Tokens sent to you, and the avatar items you've bought or been given.</li>
  <li><b>Your avatar:</b> the outfit and colours you pick, saved to your account so they follow you to other devices. Other players see your avatar in the game.</li>
  <li><b>Online status:</b> while you're signed in, the game tells our server every so often that you're online, which room you're in,
    whether that room is private, and whether you're playing on desktop, VR or mobile. This is replaced each time and is used for your friends list.</li>
  <li><b>Room visits:</b> when you visit someone's Maker room we record that a visit happened and when, so the room's creator can see visit
    totals in their creator dashboard. Creators see numbers, not who visited. Your own visits to your own rooms aren't counted.</li>
  <li><b>Multiplayer:</b> to put you in a room with other players, the game connects to Photon, our multiplayer provider. While you're in a room,
    your position, movement, avatar, name, emotes, chat messages and actions are sent to the other players in that room through Photon.
    Photon also processes your IP address to make the connection.</li>
  <li><b>Chat:</b> chat messages are delivered live to the players in your room and shown on their screens. We don't save chat on our servers.
    Players in the room can see (and could screenshot) what you say.</li>
  <li><b>Technical information:</b> like almost every online service, our hosting provider (Vercel) receives your IP address and basic request
    information (for example the page or feature you used, your browser or app version, and the time) and keeps short-term logs.
    We use IP addresses briefly in memory to limit abuse (for example too many login attempts). The game also tells our server its version number.</li>
</ul>

<h2>3. Information stored on your device</h2>
<ul>
  <li><b>Game:</b> your login (so you stay signed in), the last email and username you used, your avatar look and your settings.</li>
  <li><b>Website:</b> your login session, saved in your browser's local storage. We don't use advertising or tracking cookies.</li>
  <li><b>Launcher:</b> the game files and the installed version number, in your computer's local app data folder.</li>
</ul>
<p>Signing out removes the saved login from that device.</p>

<h2>4. How we use information</h2>
<ul>
  <li>To create and run your account and keep you signed in.</li>
  <li>To run the game: matching you into rooms, showing your avatar and name, saving and loading Maker rooms, friends, invites and Tokens.</li>
  <li>To show creators how their rooms are doing (visit totals, likes and dislikes).</li>
  <li>To keep the Service safe: preventing abuse, cheating and spam, and enforcing our Terms of Service.</li>
  <li>To fix bugs and improve the Service.</li>
  <li>To contact you about your account (for example email confirmation or password emails, or important changes to these policies).</li>
</ul>
<p>We don't use your information for advertising and we don't sell it or share it for advertising.</p>

<h2>5. What other people can see</h2>
<ul>
  <li><b>Everyone:</b> your public profile (username, display name, bio, avatar colours, level, the date you joined and your public rooms),
    and your username as the creator of any public room. Room like and dislike totals are public; who voted is not.</li>
  <li><b>Players in the same room:</b> your name, avatar, movement, emotes and chat.</li>
  <li><b>Your friends:</b> whether you're online, which room you're in and which platform you're playing on. If you're in a private room,
    friends can see its name but can't join without an invite.</li>
  <li><b>Room creators:</b> visit totals for their rooms (not who visited), and the co-owners they've added.</li>
  <li><b>Admins:</b> the people who run ${LEGAL.name} can see account information when needed to run the Service, handle reports, send Tokens or items, and mute or ban accounts.
    Admin actions (who did what, to which account, and why) are recorded in an admin log that only admins can see.</li>
  <li>Your email address is never shown to other players.</li>
</ul>

<h2>6. Service providers we use</h2>
<p>We use trusted companies to run the Service. They process information on our behalf and only as needed to provide their service:</p>
<ul>
  <li><b>Supabase</b>: database, logins and account emails.</li>
  <li><b>Vercel</b>: hosts the website and the game's server (API).</li>
  <li><b>Photon (Exit Games)</b>: real-time multiplayer connections.</li>
  <li><b>GitHub</b>: hosts game and launcher downloads.</li>
  <li><b>Unity</b>: the game engine. Depending on build settings, Unity may collect basic technical information about your device and crashes.</li>
</ul>
<p>These providers may store or process information in the United States and other countries. We may also share information if the law requires it,
to protect the safety of players or the public, or as part of a sale or transfer of the Service (in which case this policy would continue to apply).</p>

<h2>7. How long we keep information</h2>
<ul>
  <li>Account, profile, friends, rooms and game progress: until you delete them or ask us to delete your account.</li>
  <li>Online status: replaced every time the game updates it, and counted as offline after about 90 seconds.</li>
  <li>Room invites: deleted within about a day.</li>
  <li>Room visit records: kept so creators can see their history; deleted if the room is deleted.</li>
  <li>Announcements: shown for about a day. The admin log and ban or mute records: kept while needed to keep the Service safe.</li>
  <li>Hosting and provider logs: kept for a short time under each provider's own policy.</li>
</ul>

<h2>8. Your choices and rights</h2>
<ul>
  <li>You can edit your profile, delete your rooms, make rooms private, remove friends and remove co-owners yourself, in the game or on the website.</li>
  <li>You can ask us for a copy of your information, ask us to correct it, or ask us to delete your account and the information connected to it,
    by contacting ${c} from the email on your account. We'll respond within 30 days.</li>
  <li>Depending on where you live (for example the EU, the UK, or US states such as California) you may have extra rights, such as the right to object
    to or restrict some uses of your information or to complain to a data protection authority. We'll honour these rights where they apply.</li>
</ul>

<h2>9. Children</h2>
<p>${LEGAL.name} is not for children under ${LEGAL.minAge}, and we don't knowingly collect information from them. If you are under 18,
you need a parent or guardian's permission to use the Service. If you're a parent and believe your child under ${LEGAL.minAge} has made an account,
contact us at ${c} and we will delete it.</p>

<h2>10. Security</h2>
<p>We use HTTPS for all connections, keep passwords hashed with our login provider, and use database rules so players can only see and change
what they're allowed to. No system is perfectly secure, so please use a strong password that you don't use anywhere else, and tell us right away
if you think your account has been accessed by someone else.</p>

<h2>11. Changes to this policy</h2>
<p>We'll update this policy when the Service changes. The date at the top shows when it last changed. If we make important changes,
we'll let you know in the game or on the website before they take effect.</p>

<h2>12. Contact</h2>
<p>Questions or requests about privacy: ${c}.</p>
`;
}

export function termsHtml() {
  const c = contact();
  const law = LEGAL.law || '<mark>[add your state / country in public/legal.js]</mark>';
  return `
<h1>Terms of Service</h1>
<p class="hint">Version ${LEGAL.version} &middot; Last updated ${LEGAL.updated}</p>

<p>These Terms are an agreement between you and ${LEGAL.name} ("we", "us") about using the ${LEGAL.name} game, the launcher and the website at
${LEGAL.site} (the "Service"). By creating an account or using the Service you agree to these Terms and to our
<a href="#/privacy">Privacy Policy</a>. If you don't agree, please don't use the Service.</p>

<h2>1. Who can use the Service</h2>
<ul>
  <li>You must be at least ${LEGAL.minAge} years old.</li>
  <li>If you are under 18 (or the age of adulthood where you live), a parent or guardian must agree to these Terms for you.</li>
  <li>You may not use the Service if we have banned you before, or if the law where you live doesn't allow it.</li>
</ul>

<h2>2. Your account</h2>
<ul>
  <li>Use a real email address that you can access, and keep your password private. You're responsible for what happens on your account.</li>
  <li>Your username must not impersonate someone else or be offensive. We may change or remove usernames that break these Terms.</li>
  <li>Tell us right away at ${c} if you think someone else has accessed your account.</li>
</ul>

<h2>3. Community rules</h2>
<p>${LEGAL.name} is a place to hang out, play and build together. When you use it, you agree <b>not</b> to:</p>
<ul>
  <li>Harass, bully, threaten or bother other players, or encourage others to do so.</li>
  <li>Post or build anything hateful, sexual, violent or graphic, or anything that sexualises or endangers minors in any way.</li>
  <li>Share anyone's personal information (including your own), such as real names, addresses, phone numbers, passwords or photos.</li>
  <li>Ask other players for personal information, or try to move them to other apps to talk privately.</li>
  <li>Cheat, use hacked or modified game clients, exploit bugs, or use bots or scripts to play or to farm XP or Tokens.</li>
  <li>Try to access other people's accounts, our servers or our database, or interfere with how the Service works.</li>
  <li>Spam, scam, advertise, or impersonate other players, staff or anyone else.</li>
  <li>Build rooms that copy other people's work without permission or use content you don't have the rights to.</li>
  <li>Break any law.</li>
</ul>
<p>If you see someone breaking these rules, contact us at ${c}.</p>

<h2>4. Things you create</h2>
<ul>
  <li>You keep ownership of what you make: your Maker rooms, their names and descriptions, and your profile text ("your content").</li>
  <li>So we can run the Service, you give us a worldwide, free, non-exclusive licence to host, store, copy, display and share your content
    within the Service. For example, this lets us show your public rooms to other players and on the website, and lets other players visit them.
    This licence ends when you delete your content, except for copies other people made with your permission (for example co-owners) and backups
    kept for a limited time.</li>
  <li>Public rooms can be seen and visited by anyone. Private rooms can be visited by you, your co-owners, and players you invite.</li>
  <li>Room co-owners can build in your room. You choose your co-owners and can remove them at any time; you're responsible for who you add.</li>
  <li>You're responsible for your content. We may remove or hide content, or make rooms private, if we believe it breaks these Terms or the law.</li>
</ul>

<h2>5. Tokens, XP and other virtual items</h2>
<ul>
  <li>Tokens, XP, levels and other in-game items have <b>no real-world money value</b>. They can't be sold, traded for money, or cashed out.</li>
  <li>Tokens can't currently be bought with real money. You earn them by playing, and admins may give Tokens as gifts or rewards, and may remove Tokens that were gained by cheating or by mistake.</li>
  <li>You can spend Tokens on avatar items in the in-game shop. Purchases are final: spent Tokens aren't given back, except where we choose to or the law requires it. Items you buy stay on your account, but we may remove items that were gained by cheating, by mistake, or through a bug.</li>
  <li>We may change, rebalance or remove virtual items. You have a licence to use them in the Service; you don't own them.</li>
</ul>

<h2>6. Our content and your licence to use the Service</h2>
<p>The game, launcher, website, artwork, models, chips and code are owned by us or our licensors. We give you a personal, non-commercial,
non-transferable, revocable licence to install and use them to play ${LEGAL.name}. You may not copy, sell, rent, or redistribute the Service,
or reverse-engineer it, except where the law clearly allows it.</p>

<h2>7. The launcher and updates</h2>
<p>The Pickscraft launcher checks for and installs game updates automatically. Some updates may be required to keep playing.
Only download the game and launcher from ${LEGAL.site} or our official GitHub releases.</p>

<h2>8. Other services</h2>
<p>The Service relies on third-party providers (for example our database, hosting and multiplayer providers) that are listed in the Privacy Policy.
We aren't responsible for their services or outages.</p>

<h2>9. Ending your use of the Service</h2>
<ul>
  <li>You can stop using the Service at any time, and ask us to delete your account at ${c}.</li>
  <li>We may warn, mute (block chat), suspend or ban accounts (for a set time or for good), remove content, or reset progress if you break these Terms or put other players or the Service at risk.
    Where it's reasonable, we'll tell you why.</li>
  <li>We may change or stop the Service (or any part of it) at any time.</li>
</ul>

<h2>10. Disclaimers</h2>
<p>The Service is provided <b>"as is" and "as available"</b>. ${LEGAL.name} is made by a small team and may have bugs, downtime or data loss.
To the fullest extent the law allows, we don't make any promises about the Service, including that it will always be available, error-free,
or that your rooms and progress will never be lost. Other players' content and behaviour are their own responsibility, not ours.</p>

<h2>11. Limitation of liability</h2>
<p>To the fullest extent the law allows, we are not liable for any indirect, incidental, special or consequential damages, or for loss of data,
virtual items or profits, arising from your use of the Service. Our total liability for any claim about the Service is limited to US $50.
Some places don't allow these limits, so they may not fully apply to you.</p>

<h2>12. Indemnity</h2>
<p>If you break these Terms or the law while using the Service and someone makes a claim against us because of it, you agree to cover the reasonable
costs of that claim, to the extent the law allows.</p>

<h2>13. Changes to these Terms</h2>
<p>We may update these Terms as the Service changes. The date at the top shows when they last changed. If we make important changes, we'll tell
you in the game or on the website before they take effect. If you keep using the Service after that, you accept the new Terms.</p>

<h2>14. Governing law</h2>
<p>These Terms are governed by the laws of ${law}, without regard to its conflict-of-law rules. This doesn't take away any rights you have
under the consumer laws of the place where you live.</p>

<h2>15. Contact</h2>
<p>Questions about these Terms: ${c}.</p>
`;
}
