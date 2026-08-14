<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pickscraft — Minigame Server</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Pixelify+Sans:wght@500;600;700&family=Rubik:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root{
    --bg: #0d1220;
    --bg2: #171d2e;
    --bg3: #202a40;
    --grass: #62d966;
    --grass-dark: #2f8f42;
    --dirt: #6b4a2b;
    --dirt-dark: #4a3018;
    --stone: #7a7f8c;
    --gold: #ffb238;
    --diamond: #5fd9ea;
    --redstone: #ff4d4d;
    --text: #f3ece0;
    --muted: #a9b0c0;
    --border: #2c3550;
  }

  *{ box-sizing: border-box; margin:0; padding:0; }

  html{ scroll-behavior: smooth; }

  body{
    background: var(--bg);
    color: var(--text);
    font-family: 'Rubik', sans-serif;
    line-height: 1.5;
    overflow-x: hidden;
    background-image:
      radial-gradient(circle at 20% 10%, rgba(98,217,102,0.05), transparent 40%),
      radial-gradient(circle at 85% 15%, rgba(255,178,56,0.05), transparent 45%),
      repeating-linear-gradient(0deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 4px),
      repeating-linear-gradient(90deg, rgba(255,255,255,0.015) 0 2px, transparent 2px 4px);
  }

  .pixel{ font-family: 'Press Start 2P', monospace; }
  .blocky{ font-family: 'Pixelify Sans', sans-serif; }
  .mono{ font-family: 'JetBrains Mono', monospace; }

  a{ color: inherit; text-decoration: none; }

  /* ---------- NAV ---------- */
  nav{
    position: sticky; top:0; z-index: 50;
    display:flex; align-items:center; justify-content: space-between;
    padding: 18px 5vw;
    background: rgba(18,11,26,0.85);
    backdrop-filter: blur(8px);
    border-bottom: 2px solid var(--border);
  }
  .logo{
    display:flex; align-items:center; gap:10px;
    font-size: 15px; letter-spacing: 1px;
    color: var(--grass);
    text-shadow: 2px 2px 0 rgba(0,0,0,0.5);
  }
  .logo-block{
    width: 22px; height: 22px;
    background: linear-gradient(160deg, var(--grass), var(--grass-dark));
    border: 2px solid #0d3616;
    box-shadow: inset -3px -3px 0 rgba(0,0,0,0.25), inset 3px 3px 0 rgba(255,255,255,0.15);
  }
  .nav-links{ display:flex; align-items:center; gap: 22px; }
  .nav-links span{ font-size: 13px; color: var(--muted); font-weight:600; }
  .btn{
    display:inline-flex; align-items:center; gap:8px;
    padding: 11px 18px;
    font-family:'Pixelify Sans', sans-serif;
    font-weight:700; font-size:15px;
    border: 2px solid #0d0813;
    cursor:pointer;
    transition: transform .12s ease, box-shadow .12s ease;
  }
  .btn:active{ transform: translateY(2px); }
  .btn-gold{
    background: var(--gold); color:#231200;
    box-shadow: 3px 3px 0 #7a4a00;
  }
  .btn-gold:hover{ box-shadow: 4px 4px 0 #7a4a00; transform: translate(-1px,-1px); }
  .btn-ghost{
    background: transparent; color: var(--diamond); border-color: var(--diamond);
  }
  .btn-ghost:hover{ background: rgba(95,217,234,0.1); }

  @media (max-width: 720px){
    .nav-links span{ display:none; }
  }

  /* ---------- HERO ---------- */
  .hero{
    position: relative;
    min-height: 94vh;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center;
    padding: 60px 6vw 220px;
    overflow:hidden;
    background: linear-gradient(180deg, #060912 0%, #0d1430 45%, #16203f 75%, #1c2847 100%);
  }

  /* pixel moon */
  .moon{
    position:absolute; top: 9%; right: 10%;
    width: 46px; height: 46px;
    background: #eef1e6;
    box-shadow:
      0 0 40px 6px rgba(238,241,230,0.35),
      inset -10px -10px 0 rgba(0,0,0,0.06),
      inset 8px 8px 0 rgba(0,0,0,0.05);
  }
  .moon .crater{ position:absolute; background: rgba(120,120,110,0.35); }
  .moon .c1{ width:8px; height:8px; top:10px; left:8px; }
  .moon .c2{ width:6px; height:6px; top:24px; left:22px; }
  .moon .c3{ width:5px; height:5px; top:8px; left:28px; }

  .star{
    position:absolute; width:3px; height:3px; background:#fff;
    animation: twinkle 2.6s ease-in-out infinite;
  }
  @keyframes twinkle{ 0%,100%{ opacity:0.25; } 50%{ opacity:1; } }

  /* blocky terrain */
  .terrain{
    position:absolute; left:0; right:0; bottom:0;
    height: 170px;
    line-height:0;
  }
  .terrain svg{ width:100%; height:100%; display:block; }

  .cube-field{ position:absolute; inset:0; pointer-events:none; perspective: 900px; }
  .cube{
    position:absolute;
    width:44px; height:44px;
    transform-style:preserve-3d;
    animation: drift 7s ease-in-out infinite;
  }
  .cube .face{ position:absolute; width:44px; height:44px; opacity:0.9; }
  .cube .top{   transform: rotateX(90deg) translateZ(22px); filter: brightness(1.25); }
  .cube .front{ transform: translateZ(22px); }
  .cube .side{  transform: rotateY(90deg) translateZ(22px); filter: brightness(0.65); }

  .cube.grass .top,.cube.grass .front,.cube.grass .side{ background: var(--grass); }
  .cube.gold .top,.cube.gold .front,.cube.gold .side{ background: var(--gold); }
  .cube.diamond .top,.cube.diamond .front,.cube.diamond .side{ background: var(--diamond); }
  .cube.redstone .top,.cube.redstone .front,.cube.redstone .side{ background: var(--redstone); }

  @keyframes drift{
    0%,100%{ transform: translateY(0) rotateX(-18deg) rotateY(35deg); }
    50%{ transform: translateY(-22px) rotateX(-18deg) rotateY(35deg); }
  }

  .eyebrow{
    font-size: 12px; letter-spacing: 3px; color: var(--gold);
    margin-bottom: 22px;
    text-shadow: 0 0 12px rgba(255,178,56,0.5);
  }

  h1.title{
    font-size: clamp(2.4rem, 8vw, 5.5rem);
    line-height: 1.05;
    letter-spacing: 1px;
    color: #fff;
    text-shadow:
      4px 4px 0 var(--grass-dark),
      8px 8px 0 rgba(0,0,0,0.4);
    margin-bottom: 26px;
  }

  .tagline{
    max-width: 620px;
    font-size: clamp(1rem, 2vw, 1.25rem);
    color: var(--muted);
    font-weight: 500;
    margin-bottom: 38px;
  }
  .tagline strong{ color: var(--text); }

  .hero-ctas{ display:flex; gap:16px; flex-wrap:wrap; justify-content:center; margin-bottom: 46px; }

  .ip-stack{
    display:flex; flex-direction:column; gap:2px;
    border: 2px solid var(--border);
    box-shadow: 5px 5px 0 rgba(0,0,0,0.4);
    background: var(--border);
  }
  .ip-row{
    display:flex; align-items:center; gap:0;
    background: var(--bg2);
  }
  .ip-row .ip-label{
    display:flex; align-items:center; gap:8px;
    padding: 13px 16px; font-size: 11px; color: var(--muted);
    border-right: 2px solid var(--border);
    font-family:'Pixelify Sans'; letter-spacing:1px;
    width: 108px; flex-shrink:0;
  }
  .ip-row .ip-label .tag-dot{ width:7px; height:7px; flex-shrink:0; }
  .ip-row.java .tag-dot{ background: var(--grass); }
  .ip-row.bedrock .tag-dot{ background: var(--diamond); }
  .ip-row .ip-value{
    padding: 13px 16px; font-size: 15px; color: var(--text);
    font-weight: 700; flex:1; text-align:left;
  }
  .ip-row.java .ip-value{ color: var(--grass); }
  .ip-row.bedrock .ip-value{ color: var(--diamond); }
  .ip-row button{
    padding: 13px 16px;
    background: var(--grass);
    color: #0d2b10;
    border: none;
    border-left: 2px solid var(--border);
    font-family:'Pixelify Sans'; font-weight:700; font-size:13px;
    cursor:pointer;
    flex-shrink:0;
  }
  .ip-row.java button{ background: var(--grass); color:#0d2b10; }
  .ip-row.bedrock button{ background: var(--diamond); color:#0a2b30; }
  .ip-row.java button:hover{ background:#7de382; }
  .ip-row.bedrock button:hover{ background:#82e6f5; }

  .platform-badges{ display:flex; gap:12px; flex-wrap:wrap; justify-content:center; }
  .badge{
    display:flex; align-items:center; gap:8px;
    padding: 8px 14px;
    border: 1px solid var(--border);
    background: rgba(255,255,255,0.03);
    font-size: 12px; color: var(--muted); font-weight:600;
    letter-spacing: 0.5px;
  }
  .badge .dot{ width:8px; height:8px; background: var(--diamond); }

  /* ---------- SECTION SHARED ---------- */
  section{ padding: 100px 6vw; position:relative; }
  .section-head{ text-align:center; max-width: 680px; margin: 0 auto 56px; }
  .section-tag{
    font-size: 11px; letter-spacing: 3px; color: var(--diamond);
    margin-bottom: 14px; font-weight:700;
  }
  .section-title{
    font-family:'Pixelify Sans'; font-weight: 700;
    font-size: clamp(1.7rem, 4vw, 2.6rem);
    color: #fff;
  }
  .section-sub{ margin-top:14px; color: var(--muted); font-size: 1.02rem; }

  /* ---------- CRAFT GRID ---------- */
  .bench{
    max-width: 760px;
    margin: 0 auto;
    background: var(--bg2);
    border: 3px solid var(--border);
    padding: 18px;
    box-shadow: 8px 8px 0 rgba(0,0,0,0.35);
  }
  .craft-grid{
    display:grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .slot{
    aspect-ratio: 1;
    background: var(--bg3);
    border: 2px solid #0d0813;
    box-shadow: inset 0 0 0 2px rgba(255,255,255,0.03);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    text-align:center;
    padding: 10px;
    cursor: default;
    transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
    position:relative;
  }
  .slot:hover{
    transform: translateY(-4px);
    background: var(--bg2);
    box-shadow: 0 8px 0 rgba(0,0,0,0.3), 0 0 0 2px var(--accent, var(--grass));
  }
  .slot .icon{ font-size: 26px; margin-bottom: 8px; filter: drop-shadow(0 2px 0 rgba(0,0,0,0.4)); }
  .slot .name{ font-family:'Pixelify Sans'; font-weight:700; font-size: 13px; color:#fff; }
  .slot .desc{
    font-size: 10.5px; color: var(--muted); margin-top:6px; line-height:1.35;
    opacity:0; max-height:0; overflow:hidden; transition: opacity .15s ease, max-height .15s ease;
  }
  .slot:hover .desc{ opacity:1; max-height: 60px; }

  .slot.pvp{ --accent: var(--redstone); }
  .slot.bedwars{ --accent: var(--gold); }
  .slot.parkour{ --accent: var(--diamond); }
  .slot.events{ --accent: var(--grass); }
  .slot.tourney{ --accent: var(--redstone); }
  .slot.crossplay{ --accent: var(--diamond); }
  .slot.community{ --accent: var(--grass); }
  .slot.updates{ --accent: var(--gold); }
  .slot.mystery{ --accent: var(--muted); }

  .bench-caption{
    text-align:center; margin-top:18px; font-size:12px; color: var(--muted);
    font-family:'JetBrains Mono';
  }

  /* ---------- CROSSPLAY STRIP ---------- */
  .crossplay-strip{
    background: var(--bg2);
    border-top: 2px solid var(--border);
    border-bottom: 2px solid var(--border);
    display:flex; flex-wrap:wrap; align-items:center; justify-content:center; gap: 60px;
    padding: 60px 6vw;
  }
  .cp-item{ display:flex; align-items:center; gap:16px; }
  .cp-icon{
    width:54px; height:54px;
    display:flex; align-items:center; justify-content:center;
    background: var(--bg3); border: 2px solid var(--border);
    font-size: 24px;
  }
  .cp-text .cp-title{ font-family:'Pixelify Sans'; font-weight:700; color:#fff; font-size:16px; }
  .cp-text .cp-sub{ font-size: 12.5px; color: var(--muted); }
  .cp-plus{ font-size: 20px; color: var(--muted); }

  /* ---------- TOURNAMENT ALERT ---------- */
  .alert-strip{
    display:flex; align-items:center; justify-content:center; gap: 14px;
    background: repeating-linear-gradient(135deg, #2a1010, #2a1010 14px, #1a0a0a 14px, #1a0a0a 28px);
    border-top: 2px solid var(--redstone);
    border-bottom: 2px solid var(--redstone);
    padding: 16px 6vw;
    text-align:center;
  }
  .alert-strip .lamp{
    width:12px; height:12px; background: var(--redstone); border-radius:50%;
    box-shadow: 0 0 12px 3px rgba(255,77,77,0.7);
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse{ 0%,100%{ opacity:1; } 50%{ opacity:0.35; } }
  .alert-strip p{ font-family:'Pixelify Sans'; font-weight:700; font-size: 14px; color:#ffb3b3; letter-spacing: 0.5px; }

  /* ---------- FOOTER / CTA ---------- */
  .final-cta{
    text-align:center; padding: 110px 6vw 60px;
  }
  .final-cta h2{
    font-family:'Pixelify Sans'; font-weight:700;
    font-size: clamp(1.8rem, 5vw, 3rem); color:#fff; margin-bottom: 18px;
  }
  .final-cta p{ color: var(--muted); max-width: 520px; margin: 0 auto 40px; }

  footer{
    padding: 30px 6vw 40px;
    display:flex; flex-wrap:wrap; gap: 16px;
    align-items:center; justify-content:space-between;
    border-top: 2px solid var(--border);
    font-size: 12.5px; color: var(--muted);
  }
  footer .foot-ip{ color: var(--grass); font-family:'JetBrains Mono'; font-weight:700; }

  .toast{
    position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%) translateY(20px);
    background: var(--grass); color:#0d2b10; font-weight:700; font-family:'Pixelify Sans';
    padding: 12px 20px; border: 2px solid #0d0813; box-shadow: 4px 4px 0 rgba(0,0,0,0.4);
    opacity:0; pointer-events:none; transition: opacity .2s ease, transform .2s ease;
    z-index: 100; font-size: 13px;
  }
  .toast.show{ opacity:1; transform: translateX(-50%) translateY(0); }

  @media (max-width: 640px){
    .hero{ padding-bottom: 150px; }
    .terrain{ height: 110px; }
    .moon{ width:32px; height:32px; }
    .craft-grid{ grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .slot .desc{ display:none; }
    .ip-stack{ width:100%; }
    .ip-row{ flex-wrap:wrap; }
    .ip-row .ip-label{ width:auto; border-right:none; border-bottom:2px solid var(--border); flex-basis:100%; }
    .ip-row .ip-value{ font-size:12.5px; padding:10px 12px; }
    .ip-row button{ border-left:2px solid var(--border); }
  }

  @media (prefers-reduced-motion: reduce){
    .cube{ animation: none; }
    .alert-strip .lamp{ animation: none; }
    html{ scroll-behavior: auto; }
  }
</style>
</head>
<body>

<nav>
  <div class="logo"><div class="logo-block"></div>PICKSCRAFT</div>
  <div class="nav-links">
    <span>play.pickscraft.net</span>
    <a class="btn btn-ghost" href="https://store.pickscraft.net" target="_blank" rel="noopener">STORE</a>
  </div>
</nav>

<section class="hero">
  <div class="cube-field">
    <div class="cube grass" style="top:12%; left:8%; animation-delay:0s;">
      <div class="face top"></div><div class="face front"></div><div class="face side"></div>
    </div>
    <div class="cube gold" style="top:22%; left:82%; animation-delay:1.2s;">
      <div class="face top"></div><div class="face front"></div><div class="face side"></div>
    </div>
    <div class="cube diamond" style="top:65%; left:12%; animation-delay:2.1s;">
      <div class="face top"></div><div class="face front"></div><div class="face side"></div>
    </div>
    <div class="cube redstone" style="top:70%; left:88%; animation-delay:0.6s;">
      <div class="face top"></div><div class="face front"></div><div class="face side"></div>
    </div>
    <div class="cube grass" style="top:40%; left:92%; animation-delay:3s;">
      <div class="face top"></div><div class="face front"></div><div class="face side"></div>
    </div>
  </div>

  <div class="moon"><div class="crater c1"></div><div class="crater c2"></div><div class="crater c3"></div></div>
  <div class="star" style="top:14%; left:15%; animation-delay:0s;"></div>
  <div class="star" style="top:20%; left:35%; animation-delay:0.4s;"></div>
  <div class="star" style="top:10%; left:55%; animation-delay:0.8s;"></div>
  <div class="star" style="top:28%; left:68%; animation-delay:1.2s;"></div>
  <div class="star" style="top:8%; left:25%; animation-delay:1.6s;"></div>
  <div class="star" style="top:33%; left:5%; animation-delay:2s;"></div>
  <div class="star" style="top:18%; left:90%; animation-delay:0.6s;"></div>
  <div class="star" style="top:38%; left:48%; animation-delay:1.8s;"></div>
  <div class="star" style="top:24%; left:78%; animation-delay:1s;"></div>
  <div class="star" style="top:6%; left:70%; animation-delay:1.4s;"></div>

  <div class="terrain">
    <svg viewBox="0 0 1200 200" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="1200" height="200" fill="#1a2136"></rect>
      <!-- stepped grass+dirt columns forming a blocky mountain silhouette -->
      <g>
        <rect x="0"    y="150" width="60" height="50" fill="var(--dirt-dark)"></rect><rect x="0"    y="150" width="60" height="14" fill="var(--grass-dark)"></rect>
        <rect x="60"   y="135" width="60" height="65" fill="var(--dirt-dark)"></rect><rect x="60"   y="135" width="60" height="14" fill="var(--grass-dark)"></rect>
        <rect x="120"  y="115" width="60" height="85" fill="var(--dirt)"></rect><rect x="120"  y="115" width="60" height="14" fill="var(--grass)"></rect>
        <rect x="180"  y="95"  width="60" height="105" fill="var(--dirt)"></rect><rect x="180"  y="95"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="240"  y="70"  width="60" height="130" fill="var(--dirt)"></rect><rect x="240"  y="70"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="300"  y="90"  width="60" height="110" fill="var(--dirt)"></rect><rect x="300"  y="90"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="360"  y="120" width="60" height="80" fill="var(--dirt)"></rect><rect x="360"  y="120" width="60" height="14" fill="var(--grass)"></rect>
        <rect x="420"  y="105" width="60" height="95" fill="var(--dirt)"></rect><rect x="420"  y="105" width="60" height="14" fill="var(--grass)"></rect>
        <rect x="480"  y="60"  width="60" height="140" fill="var(--dirt)"></rect><rect x="480"  y="60"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="540"  y="40"  width="60" height="160" fill="var(--stone)"></rect><rect x="540"  y="40"  width="60" height="10" fill="#9298a3"></rect>
        <rect x="600"  y="55"  width="60" height="145" fill="var(--dirt)"></rect><rect x="600"  y="55"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="660"  y="85"  width="60" height="115" fill="var(--dirt)"></rect><rect x="660"  y="85"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="720"  y="115" width="60" height="85" fill="var(--dirt)"></rect><rect x="720"  y="115" width="60" height="14" fill="var(--grass)"></rect>
        <rect x="780"  y="95"  width="60" height="105" fill="var(--dirt)"></rect><rect x="780"  y="95"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="840"  y="65"  width="60" height="135" fill="var(--dirt)"></rect><rect x="840"  y="65"  width="60" height="14" fill="var(--grass)"></rect>
        <rect x="900"  y="100" width="60" height="100" fill="var(--dirt)"></rect><rect x="900"  y="100" width="60" height="14" fill="var(--grass)"></rect>
        <rect x="960"  y="130" width="60" height="70" fill="var(--dirt-dark)"></rect><rect x="960"  y="130" width="60" height="14" fill="var(--grass-dark)"></rect>
        <rect x="1020" y="110" width="60" height="90" fill="var(--dirt)"></rect><rect x="1020" y="110" width="60" height="14" fill="var(--grass)"></rect>
        <rect x="1080" y="140" width="60" height="60" fill="var(--dirt-dark)"></rect><rect x="1080" y="140" width="60" height="14" fill="var(--grass-dark)"></rect>
        <rect x="1140" y="155" width="60" height="45" fill="var(--dirt-dark)"></rect><rect x="1140" y="155" width="60" height="14" fill="var(--grass-dark)"></rect>
      </g>
      <!-- pixel trees -->
      <g>
        <rect x="150" y="99" width="10" height="16" fill="#4a2f1a"></rect>
        <rect x="136" y="79" width="38" height="20" fill="var(--grass-dark)"></rect>
        <rect x="514" y="44" width="10" height="16" fill="#4a2f1a"></rect>
        <rect x="500" y="24" width="38" height="20" fill="var(--grass-dark)"></rect>
        <rect x="864" y="49" width="10" height="16" fill="#4a2f1a"></rect>
        <rect x="850" y="29" width="38" height="20" fill="var(--grass-dark)"></rect>
      </g>
    </svg>
  </div>

  <div class="eyebrow pixel" style="font-size:10px;">A MINIGAME SERVER WORTH BLOWING UP</div>
  <h1 class="title pixel">PICKSCRAFT</h1>
  <p class="tagline">Grind PvP. Dominate Bedwars. Break your ankles on parkour. <strong>Pickscraft</strong> is the minigame server for players who are tired of boring worlds.</p>

  <div class="hero-ctas">
    <div class="ip-stack">
      <div class="ip-row java">
        <span class="ip-label"><span class="tag-dot"></span>JAVA</span>
        <span class="ip-value mono">play.pickscraft.net</span>
        <button onclick="copyIP('play.pickscraft.net', this)">COPY</button>
      </div>
      <div class="ip-row bedrock">
        <span class="ip-label"><span class="tag-dot"></span>BEDROCK</span>
        <span class="ip-value mono">bedrock.pickscraft.net:12568</span>
        <button onclick="copyIP('bedrock.pickscraft.net:12568', this)">COPY</button>
      </div>
    </div>
    <a class="btn btn-gold" href="https://store.pickscraft.net" target="_blank" rel="noopener">VISIT STORE →</a>
  </div>

  <div class="platform-badges">
    <div class="badge"><span class="dot"></span>JAVA EDITION</div>
    <div class="badge"><span class="dot"></span>BEDROCK EDITION</div>
    <div class="badge"><span class="dot"></span>FULL CROSSPLAY</div>
  </div>
</section>

<section id="minigames">
  <div class="section-head">
    <div class="section-tag">WHAT'S ON THE TABLE</div>
    <h2 class="section-title">Craft your night</h2>
    <p class="section-sub">Nine slots, endless combinations. Hover a slot to see what you're getting into.</p>
  </div>

  <div class="bench">
    <div class="craft-grid">
      <div class="slot pvp">
        <div class="icon">⚔️</div>
        <div class="name">PvP Arenas</div>
        <div class="desc">Intense player-vs-player combat across ranked and casual arenas.</div>
      </div>
      <div class="slot bedwars">
        <div class="icon">🛏️</div>
        <div class="name">Bedwars</div>
        <div class="desc">Protect your bed, break theirs. Classic team strategy, ramped up.</div>
      </div>
      <div class="slot parkour">
        <div class="icon">🧱</div>
        <div class="name">Parkour</div>
        <div class="desc">Insane maps built to test precision jumps and nerve.</div>
      </div>
      <div class="slot events">
        <div class="icon">🎪</div>
        <div class="name">Weekly Events</div>
        <div class="desc">Something new to jump into every single week.</div>
      </div>
      <div class="slot tourney">
        <div class="icon">🏆</div>
        <div class="name">Tournaments</div>
        <div class="desc">Compete for bragging rights and prizes in scheduled brackets.</div>
      </div>
      <div class="slot crossplay">
        <div class="icon">🎮</div>
        <div class="name">Crossplay</div>
        <div class="desc">Java and Bedrock players, same server, same fights.</div>
      </div>
      <div class="slot community">
        <div class="icon">💬</div>
        <div class="name">Community</div>
        <div class="desc">Grind, compete, or just hang out — everyone's welcome.</div>
      </div>
      <div class="slot updates">
        <div class="icon">🔧</div>
        <div class="name">Weekly Updates</div>
        <div class="desc">The server keeps evolving. Blink and you'll miss it.</div>
      </div>
      <div class="slot mystery">
        <div class="icon">❔</div>
        <div class="name">More Minigames</div>
        <div class="desc">More on the way — join early and help shape what's next.</div>
      </div>
    </div>
    <div class="bench-caption">TIP: THERE IS NO WRONG WAY TO PLAY PICKSCRAFT</div>
  </div>
</section>

<div class="crossplay-strip">
  <div class="cp-item">
    <div class="cp-icon">☕</div>
    <div class="cp-text">
      <div class="cp-title">Java Edition</div>
      <div class="cp-sub">Full support, no restrictions</div>
    </div>
  </div>
  <div class="cp-plus">+</div>
  <div class="cp-item">
    <div class="cp-icon">📱</div>
    <div class="cp-text">
      <div class="cp-title">Bedrock Edition</div>
      <div class="cp-sub">Console, mobile & Windows</div>
    </div>
  </div>
  <div class="cp-plus">=</div>
  <div class="cp-item">
    <div class="cp-icon">🤝</div>
    <div class="cp-text">
      <div class="cp-title">One Server</div>
      <div class="cp-sub">Everyone plays together</div>
    </div>
  </div>
</div>

<div class="alert-strip">
  <div class="lamp"></div>
  <p class="blocky">TOURNAMENTS RUNNING WEEKLY — CHECK IN-GAME FOR THE NEXT BRACKET</p>
  <div class="lamp"></div>
</div>

<section class="final-cta">
  <div class="section-tag" style="text-align:center;">BEFORE IT BLOWS UP</div>
  <h2>Join the community early</h2>
  <p>New server, real momentum. Grab your spot, learn the maps, and be one of the names people recognize once everyone else shows up.</p>
  <div class="hero-ctas" style="margin-bottom:0;">
    <div class="ip-stack">
      <div class="ip-row java">
        <span class="ip-label"><span class="tag-dot"></span>JAVA</span>
        <span class="ip-value mono">play.pickscraft.net</span>
        <button onclick="copyIP('play.pickscraft.net', this)">COPY</button>
      </div>
      <div class="ip-row bedrock">
        <span class="ip-label"><span class="tag-dot"></span>BEDROCK</span>
        <span class="ip-value mono">bedrock.pickscraft.net:12568</span>
        <button onclick="copyIP('bedrock.pickscraft.net:12568', this)">COPY</button>
      </div>
    </div>
    <a class="btn btn-gold" href="https://store.pickscraft.net" target="_blank" rel="noopener">VISIT STORE →</a>
  </div>
</section>

<footer>
  <div>© 2026 Pickscraft — Not affiliated with Mojang or Microsoft.</div>
  <div class="foot-ip">JAVA play.pickscraft.net &nbsp;·&nbsp; BEDROCK bedrock.pickscraft.net:12568</div>
</footer>

<div class="toast" id="toast">IP COPIED TO CLIPBOARD</div>

<script>
  function copyIP(ip, btn){
    navigator.clipboard.writeText(ip).then(() => {
      const toast = document.getElementById('toast');
      toast.textContent = "COPIED " + ip.toUpperCase();
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1800);
      if(btn){
        const original = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => btn.textContent = original, 1200);
      }
    }).catch(() => {
      const toast = document.getElementById('toast');
      toast.textContent = "COPY FAILED — IP IS " + ip.toUpperCase();
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2200);
    });
  }
</script>

</body>
</html>
