#!/usr/bin/env bash
# 把 wxbot 提供的 wxcdnd（朋友圈图片上传服务）装到服务器上。
# 独立的 systemd 服务，不动线上后端、数据库和 nginx。可重复运行（升级二进制也用它）。
#
# 用法（在 Mac 终端里）：
#   bash ~/Desktop/后端后台本地测试版/deploy/scripts/install-wxcdnd.sh 106.55.40.33 [安装包路径]
# 安装包默认在「下载」文件夹里找 wxcdnd*.tar.gz。过程中会提示输入一次服务器密码。
set -euo pipefail

HOST="${1:-106.55.40.33}"
PKG="${2:-}"
if [ -z "$PKG" ]; then
  PKG="$(ls -t "$HOME"/Downloads/wxcdnd*.tar.gz 2>/dev/null | head -1 || true)"
fi
if [ -z "$PKG" ] || [ ! -f "$PKG" ]; then
  echo "找不到 wxcdnd 安装包。用法：bash $0 $HOST /路径/wxcdnd-deploy.tar.gz"
  exit 1
fi
echo "==> 安装包：$PKG"

# 复用同一条 SSH 连接，只输一次密码
CTL="$HOME/.ssh/wxcdnd-%r@%h:%p"
mkdir -p "$HOME/.ssh"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ControlMaster=auto -o ControlPath="$CTL" -o ControlPersist=120)
cleanup() { ssh "${SSH_OPTS[@]}" -O exit "root@$HOST" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> 上传安装包（约 14MB）"
scp "${SSH_OPTS[@]}" "$PKG" "root@$HOST:/root/wxcdnd-deploy.tar.gz"

echo "==> 在服务器上安装"
ssh "${SSH_OPTS[@]}" "root@$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
rm -rf /root/wxcdnd-pkg && mkdir -p /root/wxcdnd-pkg
tar -xzf /root/wxcdnd-deploy.tar.gz -C /root/wxcdnd-pkg 2>/dev/null
cd /root/wxcdnd-pkg/wxcdnd
bash install.sh

INI=/etc/wxcdnd/wxcdnd.ini
ENVF=/etc/wxcdnd/wxcdnd.env
# 云服务器上：出口网卡留空；gRPC 只给本机；不启用云存储（海报已存 COS，这里只负责传到微信）
sed -i -E 's#^\s*bind_if\s*=.*#bind_if =#; s#^\s*grpc_host\s*=.*#grpc_host = 127.0.0.1#; s#^\s*cloud_storage\s*=.*#cloud_storage = empty#' "$INI"

# 访问令牌：HTTP 端口对所有网卡开放，必须设令牌，防止别人借用
if ! grep -qE '^WXCDN_AUTH_TOKEN=.+' "$ENVF" 2>/dev/null; then
  TOKEN="$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  printf 'WXCDN_AUTH_TOKEN=%s\n' "$TOKEN" > "$ENVF"
  chmod 0640 "$ENVF"; chown root:wxcdnd "$ENVF"
fi
TOKEN="$(grep -E '^WXCDN_AUTH_TOKEN=' "$ENVF" | cut -d= -f2-)"

systemctl restart wxcdnd
for i in $(seq 1 15); do
  sleep 1
  PING="$(curl -s -m 3 -X POST -H "X-Cdn-Token: $TOKEN" http://127.0.0.1:35789/v1/cdn/ping -d '{}' || true)"
  [ -n "$PING" ] && break
done

echo
echo "================ wxcdnd 安装结果 ================"
systemctl is-active wxcdnd && echo "服务状态：运行中（开机自启）"
echo "健康检查：${PING:-无响应，请看 journalctl -u wxcdnd -n 50}"
echo
echo "请把下面两项填到后台「朋友圈同步 → ① 接入配置」："
echo "  图片服务地址：http://127.0.0.1:35789"
echo "  图片服务 Token（在「高级设置」里）：$TOKEN"
echo "（后端和 wxcdnd 在同一台服务器，所以用 127.0.0.1）"
echo "================================================="
rm -rf /root/wxcdnd-pkg /root/wxcdnd-deploy.tar.gz
REMOTE
