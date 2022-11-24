import baseConfig from "../../.config/jest/jest.config.js";

export default {...baseConfig,
  preset: 'ts-jest',
  transform: {
    '^.+\\.(ts|tsx)?$': 'ts-jest',
    "^.+\\.(js|mjs)$": "babel-jest",
  },
};
