<template>
  <div class="admin-shell">
    <aside class="sidebar glass-card">
      <div class="brand">
        <div class="brand-mark"><el-icon><School /></el-icon></div>
        <div><div class="brand-title">校园本地生活</div><div class="brand-sub">让校园生活更美好</div></div>
      </div>
      <el-scrollbar class="nav-scroll">
        <template v-for="group in menuGroups" :key="group.title">
          <div class="nav-group-title">{{ group.title }}</div>
          <router-link v-for="item in group.children" :key="item.path" :to="item.path" class="nav-item">
            <el-icon><component :is="item.icon" /></el-icon><span>{{ item.title }}</span><el-icon class="chev"><ArrowRight /></el-icon>
          </router-link>
        </template>
      </el-scrollbar>
      <div class="data-card">
        <div><b>平台数据概览</b><p>实时掌握平台运营数据</p><a>查看数据大屏 →</a></div><div class="mini-cube"></div>
      </div>
      <button class="collapse-btn"><el-icon><ArrowLeft /></el-icon></button>
    </aside>
    <section class="main-area">
      <header class="topbar">
        <el-button circle :icon="Fold" />
        <div class="global-search"><el-icon><Search /></el-icon><span>搜索功能、订单、用户、商家等</span><kbd>⌘ K</kbd></div>
        <div class="top-spacer"></div>
        <el-button class="top-pill" :icon="ChatDotRound">消息 <sup>12</sup></el-button>
        <el-button class="top-pill" :icon="Bell">通知 <sup>5</sup></el-button>
        <el-button class="top-pill" :icon="QuestionFilled">帮助</el-button>
        <el-dropdown>
          <div class="profile"><div class="avatar">管</div><div><b>运营管理员</b><p>超级管理员</p></div><el-icon><ArrowDown /></el-icon></div>
          <template #dropdown><el-dropdown-menu><el-dropdown-item>个人中心</el-dropdown-item><el-dropdown-item>操作日志</el-dropdown-item><el-dropdown-item divided>退出登录</el-dropdown-item></el-dropdown-menu></template>
        </el-dropdown>
      </header>
      <main class="content"><router-view /></main>
    </section>
  </div>
</template>
<script setup lang="ts">
import { menuGroups } from '@/router/menus'
import { School, ArrowRight, ArrowLeft, Fold, Search, ChatDotRound, Bell, QuestionFilled, ArrowDown } from '@element-plus/icons-vue'
</script>
<style scoped lang="scss">
.admin-shell { min-height:100vh; display:grid; grid-template-columns:278px minmax(0,1fr); padding:18px; gap:18px; }
.sidebar { height:calc(100vh - 36px); position:sticky; top:18px; display:flex; flex-direction:column; padding:0; overflow:hidden; background:rgba(255,255,255,.58); }
.brand { height:72px; display:flex; align-items:center; gap:12px; padding:0 18px; border-bottom:1px solid rgba(226,232,240,.7); }
.brand-mark { width:46px; height:46px; border-radius:16px; display:grid; place-items:center; color:white; font-size:24px; background:linear-gradient(135deg,#1f6fff,#22d3ee); box-shadow:0 14px 30px rgba(31,111,255,.25); }
.brand-title { font-size:18px; font-weight:950; color:#0f2a5f; }
.brand-sub { font-size:12px; color:#64748b; margin-top:2px; font-weight:800; letter-spacing:2px; }
.nav-scroll { flex:1; padding:10px 12px; }
.nav-group-title { color:#94a3b8; font-size:11px; font-weight:950; padding:12px 12px 6px; }
.nav-item { height:46px; display:flex; align-items:center; gap:11px; padding:0 12px; margin:4px 0; border-radius:14px; font-weight:900; color:#334155; transition:.2s ease; }
.nav-item .chev { margin-left:auto; opacity:.45; }
.nav-item:hover { background:rgba(239,246,255,.72); transform:translateX(2px); color:#1f6fff; }
.nav-item.router-link-active { color:#1f6fff; background:linear-gradient(135deg,rgba(219,234,254,.92),rgba(255,255,255,.62)); box-shadow:inset 0 0 0 1px rgba(147,197,253,.55), 0 8px 18px rgba(31,111,255,.08); }
.data-card { margin:12px; padding:14px; border-radius:18px; background:linear-gradient(135deg,rgba(255,255,255,.78),rgba(219,234,254,.55)); display:flex; justify-content:space-between; gap:12px; border:1px solid rgba(255,255,255,.7); }
.data-card p { margin:5px 0 8px; color:#64748b; font-size:12px; }
.data-card a { color:#1f6fff; font-weight:900; font-size:12px; }
.mini-cube { width:58px; height:58px; border-radius:18px; background:linear-gradient(135deg,#dbeafe,#60a5fa); box-shadow: inset 0 0 0 1px rgba(255,255,255,.8); }
.collapse-btn { width:32px; height:32px; border:0; border-radius:50%; margin:0 auto 14px; background:rgba(255,255,255,.84); color:#64748b; box-shadow:var(--mx-shadow-soft); }
.main-area { min-width:0; }
.topbar { height:58px; position:sticky; top:18px; z-index:20; display:flex; align-items:center; gap:14px; padding:0 14px; margin-bottom:14px; border-radius:18px; background:rgba(255,255,255,.62); border:1px solid rgba(255,255,255,.75); box-shadow:var(--mx-shadow-soft); backdrop-filter:blur(20px); }
.global-search { height:40px; width:430px; max-width:40vw; border-radius:16px; display:flex; align-items:center; gap:10px; padding:0 12px; background:rgba(255,255,255,.8); border:1px solid rgba(226,232,240,.75); color:#94a3b8; font-weight:800; }
kbd { margin-left:auto; border:1px solid #dbeafe; background:#f8fafc; border-radius:8px; padding:2px 7px; color:#64748b; }
.top-spacer { flex:1; }
.top-pill { position:relative; background:rgba(255,255,255,.76)!important; border-color:rgba(226,232,240,.8)!important; }
sup { color:white; background:#ef4444; border-radius:999px; padding:1px 5px; font-size:10px; position:absolute; transform:translate(2px,-11px); }
.profile { display:flex; align-items:center; gap:10px; padding:4px 6px; cursor:pointer; }
.profile p { margin:2px 0 0; font-size:12px; color:#64748b; }
.content { padding:0 2px 18px; }
@media(max-width:980px){ .admin-shell{ grid-template-columns:1fr; padding:10px; } .sidebar{ display:none; } .global-search{ width:auto; flex:1; max-width:none; } .top-pill{ display:none; } }
</style>
