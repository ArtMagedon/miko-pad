# Miko Pad

Miko Pad — self-hosted Excalidraw workspace. The editor is based on the official `@excalidraw/excalidraw` React package. A small FastAPI service stores one shared board as a normal JSON file on the host.

## Start

Requirements: Docker Engine and the Docker Compose plugin.

```bash
docker compose up -d --build
```

Open **http://localhost:8080**.

No accounts, OAuth providers, database, external storage, or manual application configuration are required.

## Persistence

The board is stored at:

```
./data/board.excalidraw
```

The directory is mounted into the API container at `/data`. The file is created automatically after the first edit. The app loads it on every page opening and saves changes automatically (debounced). Image data is stored in the same file as the scene.

Back up the board by copying `data/board.excalidraw`. To restore it, stop the stack, replace the file, and start the stack again.

## Useful commands

```bash
docker compose logs -f
docker compose down
docker compose up -d --build
```

The board survives container recreation and image updates as long as the host `data/` directory is preserved. `docker compose down -v` does not remove this bind-mounted directory, but deleting `data/` manually will remove the board.

## Architecture

- **Frontend:** React + Vite + official Excalidraw React component.
- **Web server:** Nginx serves the static application and proxies `/api/*`.
- **Backend:** FastAPI reads and atomically writes the board JSON.
- **Storage:** one host-side file, `./data/board.excalidraw`.

This is a single shared board, not a multi-user collaboration server. Anyone who can access the web page can edit it. Put it behind your trusted network or an authenticated reverse proxy before exposing it to the public Internet.

## Configuration

The default setup requires no configuration. The web interface is published on port **8080**. Change the left side of the port mapping in `docker-compose.yml` if that port is already occupied.

## Upstream

Editor: [Excalidraw](https://github.com/excalidraw/excalidraw)  
Package: [@excalidraw/excalidraw](https://www.npmjs.com/package/@excalidraw/excalidraw)

The upstream editor is distributed under its own license; see the upstream project for details.
