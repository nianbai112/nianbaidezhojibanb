// 独立回归测试配置（仅用于 AUD 修复回归，不修改默认 jest 配置/package.json）
// 使用 isolatedModules 仅转译不类型检查，避免对当前无测试代码库触发无关类型噪音。
module.exports = {
  rootDir: 'src',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true }],
  },
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@common/(.*)$': '<rootDir>/common/$1',
    '^@config/(.*)$': '<rootDir>/config/$1',
    '^@modules/(.*)$': '<rootDir>/modules/$1',
    '^@guards/(.*)$': '<rootDir>/guards/$1',
    '^@decorators/(.*)$': '<rootDir>/decorators/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@types/(.*)$': '<rootDir>/types/$1',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
};
