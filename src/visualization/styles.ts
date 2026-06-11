export const visualizationCss = `
.mcsm-image {
  box-sizing: border-box;
  max-width: 100%;
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 16px;
  padding: 28px;
  color: #f7fbff;
  background: rgba(16,24,39,.88);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.mcsm-image-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.mcsm-image-header p {
  margin: 0 0 8px;
  color: #39c5bb;
  font-size: 12px;
  font-weight: 600;
}
.mcsm-image-header h3 {
  margin: 0;
  font-size: 30px;
}
.mcsm-image-header span,
.mcsm-image-header time {
  opacity: .72;
}
.mcsm-node-grid,
.mcsm-server-grid {
  display: grid;
  gap: 16px;
}
.mcsm-server-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.mcsm-node-card,
.mcsm-server-card {
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 12px;
  padding: 18px;
  background: rgba(255,255,255,.08);
}
.mcsm-node-card header,
.mcsm-server-card header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.mcsm-node-card strong,
.mcsm-server-card strong {
  display: block;
  font-size: 18px;
}
.mcsm-node-card header span,
.mcsm-server-card header span {
  display: block;
  margin-top: 4px;
  opacity: .68;
}
.mcsm-node-card em,
.mcsm-server-card em {
  border-radius: 8px;
  padding: 4px 10px;
  color: #081412;
  background: #39c5bb;
  font-size: 12px;
  font-style: normal;
  font-weight: 700;
}
.mcsm-node-card.is-offline em,
.mcsm-server-card.is-stopped em {
  color: #1d1111;
  background: #ff8a8a;
}
.mcsm-meter-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 18px 0;
}
.mcsm-meter,
.mcsm-stat {
  display: grid;
  gap: 4px;
  border-radius: 8px;
  padding: 10px;
  background: rgba(255,255,255,.08);
}
.mcsm-meter span,
.mcsm-stat small {
  opacity: .62;
}
.mcsm-node-card footer,
.mcsm-server-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.mcsm-node-card p,
.mcsm-motd {
  margin: 14px 0 0;
  line-height: 1.55;
  opacity: .78;
}
.mcsm-address {
  margin: 16px 0;
  border-radius: 8px;
  padding: 12px;
  color: #39c5bb;
  background: rgba(57,197,187,.12);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-weight: 800;
}
.mcsm-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}
.mcsm-tags span {
  border-radius: 8px;
  padding: 4px 9px;
  background: rgba(255,255,255,.10);
  font-size: 12px;
}
`;
