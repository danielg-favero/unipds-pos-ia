// {
//   "mcpServers": {
//     "filesystem": {
//       "command": "npx",
//       "args": [
//         "-y",
//         "@modelcontextprotocol/server-filesystem",
//         "/Users/username/Desktop",
//         "/path/to/other/allowed/dir"
//       ]
//     }
//   }
// }

export function getFsTool() {
  return {
    filesystem: {
      transport: "stdio" as const,
      command: "npx",
      args: [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        `${process.cwd()}/reports`,
      ],
    },
  };
}
