import path from "node:path"
import type {NextConfig} from "next"

// The package is linked from two folders up: Turbopack must see it as inside the project.
const config: NextConfig = {
  turbopack: {root: path.resolve(import.meta.dirname, "../..")},
}

export default config
