/** @jsxImportSource react */

import { formatPlayers, ImageShell, Stat } from "./components";
import type { VisualizationLayoutProps } from "./types";

export function ServerListLayout({ layout, data }: VisualizationLayoutProps) {
  const running = data.servers.filter((server) => server.status === "running").length;

  return (
    <ImageShell
      className="mcsm-image--servers"
      width={layout.previewWidth}
      title={data.panelName}
      subtitle={`${running}/${data.servers.length} Minecraft servers running`}
      generatedAt={data.generatedAt}
    >
      <section className="mcsm-server-grid">
        {data.servers.map((server) => (
          <div
            key={server.id}
            className={`mcsm-server-card is-${server.status}`}
          >
            <header>
              <div>
                <strong>{server.name}</strong>
                <span>{server.nodeName ?? server.nodeId ?? "Unknown node"}</span>
              </div>
              <em>{server.status}</em>
            </header>
            <p className="mcsm-address">
              {server.address ?? "No address configured"}
            </p>
            <div className="mcsm-server-meta">
              <Stat label="Players" value={formatPlayers(server)} />
              <Stat label="Version" value={server.version ?? "unknown"} />
              <Stat label="Type" value={server.type ?? "minecraft"} />
            </div>
            {server.motd ? <p className="mcsm-motd">{server.motd}</p> : null}
            {server.tags.length ? (
              <div className="mcsm-tags">
                {server.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </section>
    </ImageShell>
  );
}
