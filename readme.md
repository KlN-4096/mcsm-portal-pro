# MCSM Portal

[![npm](https://img.shields.io/npm/v/koishi-plugin-mcsm-portal?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-mcsm-portal)

A Minecraft-styled MCSManager portal for Koishi.

## Features

- Bind to an MCSManager panel with an API key.
- Check MCSManager node status from chat.
- List Minecraft server instances hosted by MCSManager.
- Render status and server lists as text or Minecraft-style images.
- Copy a server address quickly by name, alias, or instance ID.
- Optional QQ interaction helpers for reaction mirroring and OneBot-compatible avatar double-tap.

## Requirements

- Koishi `^4.18.7`
- MCSManager with API access enabled
- Optional: `koishi-plugin-puppeteer` for sharper PNG image output

## Setup

Install `koishi-plugin-mcsm-portal` from the Koishi marketplace or npm, then configure:

- `connection.endpoint`: your MCSManager panel URL, for example `http://127.0.0.1:23333`
- `connection.apiKey`: your MCSManager API key
- `output.mode`: `text` or `image`
- `image.puppeteer`: enable when the Puppeteer service is available

The default root command is `mcsm`.

## Commands

| Command            | Description                        |
| ------------------ | ---------------------------------- |
| `mcsm check`       | Check MCSManager API connectivity. |
| `mcsm status`      | Show node status.                  |
| `mcsm servers`     | Show Minecraft server instances.   |
| `mcsm addr <name>` | Return a matching server address.  |
| `mcsm refresh`     | Refresh cached MCSManager data.    |

Dot commands such as `mcsm.status` are also supported.

## Links

- Source: <https://github.com/KrLite/mcsm-portal>
- Issues: <https://github.com/KrLite/mcsm-portal/issues>
