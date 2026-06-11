/** @jsxImportSource react */

import { createImageStyle, formatPlayers, serverLatencyLabel } from "./components";
import type { VisualizationLayoutProps } from "./types";

export function ServerListLayout({ layout, data }: VisualizationLayoutProps) {
  const running = data.servers.filter((server) => server.status === "running").length;

  return (
    <article
      className="mcsm-image mcsm-image--servers mcsm-minecraft-screen"
      style={createImageStyle(layout.previewWidth, data.backgroundTile)}
    >
      <header className="mcsm-minecraft-screen__header">
        <span>{data.panelName}</span>
        <h3>Play Multiplayer</h3>
        <small>{running}/{data.servers.length} servers online</small>
      </header>

      <section className="mcsm-minecraft-server-list">
        {data.servers.map((server) => (
          <article
            key={server.id}
            className={`mcsm-server-row is-${server.status}`}
          >
            <div className="mcsm-server-icon" aria-hidden="true">
              <span>{server.name.slice(0, 1)}</span>
            </div>
            <div className="mcsm-server-main">
              <div className="mcsm-server-title-line">
                <strong>{server.name}</strong>
                <span>{formatPlayers(server)}</span>
              </div>
              <p className="mcsm-server-motd">
                {server.motd ?? server.address ?? "Minecraft Server"}
              </p>
              <p className="mcsm-server-address">
                {server.address ?? "No address configured"}
              </p>
            </div>
            <aside className="mcsm-server-side">
              <span className="mcsm-ping-bars" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <small>{serverLatencyLabel(server)}</small>
              <small>{server.version ?? server.type ?? "Minecraft"}</small>
            </aside>
          </article>
        ))}
      </section>

      <footer className="mcsm-minecraft-buttons">
        <button>Join Server</button>
        <button>Direct Connect</button>
        <button>Refresh</button>
      </footer>

      <p className="mcsm-minecraft-caption">
        {new Date(data.generatedAt).toLocaleString()}
      </p>
    </article>
  );
}
