# a directory browser menu

`dirMenu(title, fetchDir, onPick, {start})` is a menu that walks a tree. The host supplies
`fetchDir(path)` returning `{path, parent, dirs, files}`, so the package never learns where the
tree lives. Folder rows drill in, the `..` row goes up, a file row calls `onPick(path)` and closes.

Each navigation rebuilds the one list section through `menu.refresh`, so the panel keeps its place.
Filtering (which files match) is the host's job: return only the files that should show.

Live example: the directory browser block in `demo/index.html`, menus panel.
