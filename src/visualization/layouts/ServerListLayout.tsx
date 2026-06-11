/** @jsxImportSource react */

import {
  COPYRIGHT_TEXT,
  createImageStyle,
  formatDate,
  formatPlayers,
  serverLatencyLabel,
} from "./components";
import type { VisualizationLayoutProps } from "./types";

export function ServerListLayout({ layout, data }: VisualizationLayoutProps) {
  const running = data.servers.filter(
    (server) => server.status === "running",
  ).length;

  return (
    <article
      className="mcsm-image mcsm-image--servers mcsm-minecraft-screen"
      style={createImageStyle(layout.previewWidth, data.backgroundTile)}
    >
      <header className="mcsm-minecraft-screen__header">
        <span>{data.portalName}</span>
        <h3>{data.serverTitle}</h3>
        <small>
          {running}/{data.servers.length} servers online
        </small>
      </header>

      <section className="mcsm-minecraft-server-list">
        {data.servers.map((server) => (
          <article
            key={server.id}
            className={`mcsm-server-row is-${server.status}`}
          >
            <div className="mcsm-server-icon" aria-hidden="true">
              {server.iconUrl ? (
                <img src={server.iconUrl} alt="" />
              ) : (
                <span>{server.name.slice(0, 1)}</span>
              )}
            </div>
            <div className="mcsm-server-main">
              <div className="mcsm-server-title-line">
                <strong>{server.name}</strong>
              </div>
              <p className="mcsm-server-motd">
                {server.motd ?? server.address ?? "Minecraft Server"}
              </p>
              <p className="mcsm-server-address">
                {server.address ?? "No address configured"}
              </p>
            </div>
            <aside className="mcsm-server-side">
              <div className="mcsm-server-presence">
                <div className="mcsm-server-status-stack">
                  <small className="mcsm-server-status-tag">
                    {serverLatencyLabel(server).toUpperCase()}
                  </small>
                  <span className="mcsm-server-players">
                    {formatPlayers(server)}
                  </span>
                </div>
                <span className="mcsm-ping-bars" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <small className="mcsm-server-version">
                {server.version ?? "Minecraft"}
              </small>
            </aside>
          </article>
        ))}
      </section>

      <footer className="mcsm-minecraft-footer">
        <small className="mcsm-image-copyright">{COPYRIGHT_TEXT}</small>
        <time className="mcsm-minecraft-caption">
          {formatDate(data.generatedAt)}
        </time>
      </footer>
    </article>
  );
}
