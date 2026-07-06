# MCSM Portal Pro

Personal customized fork of MCSM Portal for Koishi.

Original project: <https://github.com/KrLite/mcsm-portal>

Current project: <https://github.com/KlN-4096/mcsm-portal-pro>

## Feature

- Bind to an MCSManager panel with an API key.
- Check MCSManager node status from chat.
- List Minecraft server instances hosted by MCSManager, with status filtering and online player names from the terminal `list` command.
- Use optional remote latency testing services when local Minecraft status latency is missing or useless.
- Render status and server lists as text or Minecraft-style images.
- Copy a server address quickly by name, alias, or instance ID.
- Execute commands through the MCSManager instance terminal, optionally using interactive server selection and chat voting.
- Show command execution votes as QQ official bot buttons or Minecraft-style progress images.
- Customize server-list and terminal-execution failure messages.
- Optional QQ interaction helpers for reaction mirroring and OneBot-compatible avatar double-tap.

## Requirements

- Koishi `^4.18.7`
- MCSManager with API access enabled
- Optional: `koishi-plugin-puppeteer` for sharper PNG image output

## Setup

Install `koishi-plugin-mcsm-portal-pro` for personal use, then configure:

- `connection.endpoint`: your MCSManager panel URL, for example `http://127.0.0.1:23333`
- `connection.apiKey`: your MCSManager API key
- `minecraft.defaultStatuses`: server statuses shown by `mcsm servers` when no status is passed. Defaults to `running`; leave empty to show all statuses.
- `minecraft.latencyFallback`: optional JSON latency testing services. For example: `https://motd.minebbs.com/api/status?host={host}&port={port}`
- `output.mode`: `text` or `image`
- `image.puppeteer`: enable when the Puppeteer service is available
- `fields.playerNames`: show player names returned by the terminal `list` command
- `commandExecution.enabled`: enable chat-side command execution through the MCSManager terminal
- `commandExecution.voting.enabled`: require chat voting before command execution
- `commandExecution.voting.presentation`: `auto`, `qq-button`, or `image`. `auto` uses QQ official bot buttons on QQ official bot sessions and image progress elsewhere. `qq-button` falls back to image progress outside QQ official bot sessions.

The default root command is `mcsm`.

## Commands

| Command                      | Description                                              |
| ---------------------------- | -------------------------------------------------------- |
| `mcsm check`                 | Check MCSManager API connectivity.                       |
| `mcsm status`                | Show node status.                                        |
| `mcsm servers [status]`      | Show Minecraft server instances by status.               |
| `mcsm addr <name>`           | Return a matching server address.                        |
| `mcsm exec [server] [command]` | Execute a command through the MCSManager terminal and show new output. |
| `mcsm refresh`               | Refresh cached MCSManager data.                          |

Dot commands such as `mcsm.status` are also supported.

Supported server status filters are `running`, `stopped`, `starting`, `stopping`, `unknown`, and `all`.

`mcsm exec list` treats `list` as the command, asks you to choose a running server when multiple running servers are available, skips selection when only one running server exists, then executes after the optional vote passes. `mcsm exec <server> <command>` is still supported for direct targeting. Command execution uses the MCSManager instance terminal and does not require Minecraft RCON.

Terminal output capture sends vanilla `data get storage` marker commands before and after the target command, then returns the log lines captured between those markers.

Execution voting no longer uses the old text progress messages. QQ official bot sessions render input buttons; QQ inserts `@bot` plus the vote word, and the plugin accepts that at-mention reply. Other adapters render the vote as an image; users still vote with `mcsm.vote yes` or `mcsm.vote no`.

## Customization Notes

This fork keeps the original MCSManager portal workflow and adds personal-use changes:

- `mcsm servers` defaults to running servers and supports explicit status filters.
- Player names are read from the instance terminal `list` command only when `fields.playerNames` is enabled.
- Chat command execution uses the MCSManager terminal instead of Minecraft RCON.
- Terminal capture uses per-instance command queues and marker-bounded log parsing to reduce output mixing.
- Command execution votes can render as QQ official bot buttons or Minecraft-style progress images.
- Instances that do not echo terminal markers are skipped for automatic player-list probing after a timeout.
- Remote latency fallback can read JSON values such as MineBBS MOTD API's `delay` field.
- Server-list and terminal-execution failure messages can be customized.

## Links

- Source: <https://github.com/KlN-4096/mcsm-portal-pro>
- Original project: <https://github.com/KrLite/mcsm-portal>
