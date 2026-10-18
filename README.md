# Pickscraft Network - website + game API

One project does both jobs:

* **The website** (`index.html`, `app.js`, `styles.css`) - accounts, profiles, friends, player rooms.
* **The API** (`/api/...`, code in `lib/api.js`) - the game and the website send every request here.
  Only the API knows the Supabase keys; players' games never see them.

```
Unity game  --->  https://your-site/api/...  --->  Supabase (database + logins)
Website     --->  https://your-site/api/...  --/
```

## 1. Database (once)
1. Make a free project at https://supabase.com.
2. SQL Editor -> paste `supabase/schema.sql` -> Run.
3. Authentication -> URL Configuration -> set **Site URL** to your website (http://localhost:3000 while testing).
   Players sign up with their real email. "Confirm email" can stay on: they click the link in the
   email, then log in (website or game) with email + password. Turn it off if you want instant sign-ups.
4. Project Settings -> API -> copy the **Project URL** and the **anon public** key.

## 2. Run it on your PC (testing)
```
copy .env.example .env      (then paste the URL + anon key into .env)
npm run dev
```
Open http://localhost:3000. In Unity, `Assets/Pickscraft/Resources/PickscraftConfig.json` should say
`"apiUrl": "http://localhost:3000"`.

## 3. Put it online (Vercel, free)
1. Push this folder to GitHub (the `.env` file is ignored on purpose).
2. https://vercel.com -> Add New Project -> import the repo -> Deploy.
3. Project -> Settings -> Environment Variables: add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, then Redeploy.
4. In Unity set `"apiUrl": "https://YOUR-SITE.vercel.app"` before building the game.

Check it works: open `https://YOUR-SITE/api/health` - it should say `"configured": true`.

## API routes
| Method | Route | Login? | What it does |
|---|---|---|---|
| GET | /api/health | - | Server status |
| GET | /api/stats | - | Players / online / rooms counts |
| GET | /api/auth/available?username= | - | Is a username free |
| POST | /api/auth/signup `{username,email,password}` | - | Make an account (may answer `{confirm:true}` = check your email) |
| POST | /api/auth/login `{email,password}` | - | Log in, returns a login |
| POST | /api/auth/refresh `{refresh_token}` | - | Renew a login |
| POST | /api/auth/logout | yes | Log out |
| GET / PATCH | /api/me `{display_name,bio,avatar_color,shirt_color}` | yes | Your profile |
| POST | /api/me/xp `{amount}` | yes | Match XP (max 50, rate-limited in the DB) |
| POST | /api/presence `{room_kind,room_name,session,platform}` | yes | "I'm in this room" heartbeat |
| POST | /api/presence/offline | yes | Mark offline |
| GET | /api/friends | yes | Friends + where they are |
| GET | /api/friends/requests | yes | Pending requests |
| POST | /api/friends/request `{username}` | yes | Send request -> `{result}` |
| POST | /api/friends/respond `{request_id,accept}` | yes | Accept / decline |
| POST | /api/friends/remove `{user_id}` | yes | Unfriend / cancel |
| GET | /api/players/:username | - | Public profile + public rooms |
| GET | /api/rooms?scope=mine / ?sort=popular\|new | mine: yes | List Maker rooms |
| POST | /api/rooms `{name,data,is_public}` | yes | Create a room |
| GET / PATCH / DELETE | /api/rooms/:id | edit: yes | Read / save / delete a room (owner only) |
| POST | /api/rooms/:id/visit | - | Count a visit (logged for the creator dashboard) |
| GET | /api/creator | yes | Creator dashboard: totals, rooms, daily / weekly / monthly visits |
| GET | /api/creator/rooms/:id | yes | One room's daily / weekly / monthly visits |
| GET | /api/me/gifts | yes | Unopened Token gift boxes |
| POST | /api/me/gifts/:id/open | yes | Open a gift box -> `{amount,message,from_name,tokens}` |
| POST | /api/admin/tokens `{username,amount,message}` | admin | Give Tokens (`*` = everyone, negative = take away) |
| GET | /api/admin/gifts | admin | Recent gifts |

Logged-in requests send `Authorization: Bearer <access_token>` (the game does this for you).
Errors come back as `{"error": "message"}` with a matching HTTP status.

## Tokens (currency) and the Admin page
1. Re-run `supabase/schema.sql` in the SQL Editor after every update (it's safe to run again).
2. Make yourself an admin once (SQL Editor):
   `update public.profiles set is_admin = true where username = 'YourUsername';`
3. Log in on the website: an **Admin** link appears. Type a username (or `*` for everyone), an amount and a message.
   The Tokens land in their balance straight away. If they're in the game, a gift box drops in front of them
   within ~15 seconds; touching it opens it and shows how many Tokens they got and your message.
   If they're offline, the box waits for their next visit.

## Creator dashboard
**Creator** in the top bar shows visits to your Maker rooms: today, this week, this month, this year and all time,
unique players, a chart by day / week / month, and a table of every room (click one for its own chart).
Your own visits don't count, and each player counts at most once every 10 minutes per room.

