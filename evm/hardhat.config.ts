import * as dotenv from "dotenv";

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
import "solidity-docgen";
import "hardhat-deploy";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "hardhat-dependency-compiler";
// import "@matterlabs/hardhat-zksync-solc";
// import "@matterlabs/hardhat-zksync-deploy";
// import "@matterlabs/hardhat-zksync-verify";
// import "@matterlabs/hardhat-zksync-upgradable";

import "./tasks";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const config: HardhatUserConfig = {
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    deploy: "src/deploy",
    sources: "contracts",
  },
  mocha: {
    timeout: 1000000,
  },
  namedAccounts: {
    deployer: 0,
    verifiedSigner: 5,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: { enabled: true, runs: 1000000 },
          viaIR: true,
        },
      },
    ],
  },
  networks: {
    hardhat: {
      accounts: {
        accountsBalance: "10000000000000000000000000",
      },
      allowUnlimitedContractSize: true,
      chainId: 31337,
      zksync: true,
    },
    ganache: {
      chainId: 1337,
      url: "http://localhost:8545",
      accounts: {
        mnemonic:
          "garbage miracle journey siren inch method pulse learn month grid frame business",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
      },
    },
    mainnet: {
      url: process.env.ETH_MAINNET_URL || "",
      chainId: 1,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    goerli: {
      url: process.env.GOERLI_URL || "",
      chainId: 5,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    base: {
      url: process.env.BASE_MAINNET_URL || "",
      chainId: 8453,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    blast: {
      url: process.env.BLAST_MAINNET_URL || "https://rpc.blast.io",
      chainId: 81457,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    holesky: {
      url: process.env.HOLESKY_URL || "",
      chainId: 17000,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    polygon: {
      url: process.env.POLYGON_URL || "",
      chainId: 137,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    polygonMumbai: {
      url: process.env.POLYGON_MUMBAI_URL || "",
      chainId: 80001,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    bsc: {
      url: "https://bsc-dataseed2.binance.org",
      chainId: 56,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    bscTestnet: {
      url:
        process.env.BSC_TESTNET_URL ||
        "https://wandering-broken-tree.bsc-testnet.quiknode.pro/7992da20f9e4f97c2a117bea9af37c1c266f63ec/",
      chainId: 97,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      gasPrice: 50e9,
    },
    fantom: {
      url:
        process.env.FANTOM_URL ||
        "https://fantom.blockpi.network/v1/rpc/public",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 250,
    },
    fantomTest: {
      url: "https://rpc.ankr.com/fantom_testnet",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 4002,
    },
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 43114,
    },
    avalancheFuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 43113,
    },
    arbitrum: {
      url: "https://arb-pokt.nodies.app",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 42161,
    },
    arbitrumGoerli: {
      url: "https://goerli-rollup.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 421613,
    },
    arbitrumRinkeby: {
      url: "https://rinkeby.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 421611,
    },
    arbitrumNova: {
      url: "https://nova.arbitrum.io/rpc",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 42170,
    },
    linea: {
      url: "https://rpc.linea.build",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 59144,
    },
    scroll: {
      url: "https://1rpc.io/scroll",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 534352,
    },
    scrollSepolia: {
      url: "https://rpc.ankr.com/scroll_sepolia_testnet",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 534351,
    },
    mode: {
      url: process.env.MODE_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 34443,
    },
    zkevm: {
      url: process.env.ZKEVM_MAINNET_URL || "https://zkevm-rpc.com",
      chainId: 1101,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    zkevmTestnet: {
      url: process.env.ZKEVM_TESTNET_URL || "https://rpc.public.zkevm-test.net",
      chainId: 1442,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    optimismGoerli: {
      url: `https://goerli.optimism.io`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 420,
    },
    optimism: {
      url: `https://mainnet.optimism.io`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 10,
    },
    manta: {
      url: `https://pacific-rpc.manta.network/http`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 169,
    },
    sepolia: {
      url: `https://rpc2.sepolia.org`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 11155111,
    },
    moonbeam: {
      url: "https://rpc.api.moonbeam.network",
      chainId: 1284,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
    },
    moonbeamTestnet: {
      url: "https://rpc.api.moonbase.moonbeam.network",
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 1287,
    },
    celoTestnet: {
      url: `https://alfajores-forno.celo-testnet.org`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 44787,
      // gasPrice: 6400000
    },
    celo: {
      url: `https://forno.celo.org`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 42220,
      // gasPrice: 6400000
    },
    neonDevnet: {
      url: `https://proxy.devnet.neonlabs.org/solana`,
      accounts:
        process.env.PRIVATE_KEY !== undefined
          ? [process.env.PRIVATE_KEY]
          : [""],
      chainId: 245022926,
      // gasPrice: 6400000
    },
    // zkSync: {
    //   saveDeployments: true,
    //   accounts:
    //     process.env.PRIVATE_KEY !== undefined
    //       ? [process.env.PRIVATE_KEY]
    //       : [""],
    //   chainId: 324,
    //   url: "https://mainnet.era.zksync.io",
    //   ethNetwork: "mainnet",
    //   zksync: true,
    //   deployPaths: "deploy", //single deployment directory
    // },
  },

  gasReporter: {
    outputFile: "gas-report.txt",
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    noColors: true,
    coinmarketcap: process.env.COIN_MARKETCAP_API_KEY || "",
    token: "ETH",
  },
  // zksolc: {
  //   version: "1.4.0", // optional.
  //   settings: {
  //     // compilerPath: "zksolc", // optional. Ignored for compilerSource "docker". Can be used if compiler is located in a specific folder
  //     libraries: {}, // optional. References to non-inlinable libraries
  //     missingLibrariesPath:
  //       "./.zksolc-libraries-cache/missingLibraryDependencies.json", // optional. This path serves as a cache that stores all the libraries that are missing or have dependencies on other libraries. A `hardhat-zksync-deploy` plugin uses this cache later to compile and deploy the libraries, especially when the `deploy-zksync:libraries` task is executed
  //     isSystem: false, // optional.  Enables Yul instructions available only for zkSync system contracts and libraries
  //     forceEvmla: false, // optional. Falls back to EVM legacy assembly if there is a bug with Yul
  //     optimizer: {
  //       enabled: true, // optional. True by default
  //       mode: "3", // optional. 3 by default, z to optimize bytecode size
  //     },
  //     experimental: {
  //       dockerImage: "", // deprecated
  //       tag: "", // deprecated
  //     },
  //   },
  // },

  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
      holesky: process.env.ETHERSCAN_API_KEY || "",
      base: process.env.BASE_API_KEY || "",
      polygonMumbai: process.env.POLYGONSCAN_API_KEY || "",
      polygon: process.env.POLYGONSCAN_API_KEY || "",
      opera: process.env.FTMSCAN_API_KEY || "",
      ftmTestnet: process.env.FTMSCAN_API_KEY || "",
      bscTestnet: process.env.BSCSCAN_API_KEY || "",
      bsc: process.env.BSCSCAN_API_KEY || "",
      linea: process.env.LINEA_API_KEY || "",
      scroll: process.env.SCROLL_API_KEY || "",
      scrollSepolia: process.env.SCROLL_API_KEY || "",
      moonbeam: process.env.MOONBEAM_KEY || "",
      moonbaseAlpha: process.env.MOONBEAM_KEY || "",
      avalancheFujiTestnet: process.env.AVALANCHE_API_KEY || "",
      avalanche: process.env.AVALANCHE_API_KEY || "",
      arbitrumGoerli: process.env.ARBITRUM_API_KEY || "",
      arbitrumTestnet: process.env.ARBITRUM_API_KEY || "",
      arbitrumOne: process.env.ARBITRUM_API_KEY || "",
      optimisticGoerli: process.env.OPTIMISM_API_KEY || "",
      optimisticEthereum: process.env.OPTIMISM_API_KEY || "",
      manta: process.env.ETHERSCAN_API_KEY || "",
      mode: process.env.ETHERSCAN_API_KEY || "",
      zkSync: "UWXM66JSY25DSV1NQQBB5J3ZX6H4AA56NN",
      blast: process.env.BLASTSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "zkSync",
        chainId: 324,
        urls: {
          apiURL: "https://block-explorer-api.mainnet.zksync.io/api",
          browserURL: "https://explorer.zksync.io/",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org/",
        },
      },
      {
        network: "linea",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build/",
        },
      },
      {
        network: "scroll",
        chainId: 534352,
        urls: {
          apiURL: "https://api.scrollscan.com/api",
          browserURL: "https://scrollscan.com/",
        },
      },
      {
        network: "scrollSepolia",
        chainId: 534351,
        urls: {
          apiURL: "https://api-sepolia.scrollscan.com/api",
          browserURL: "https://sepolia.scrollscan.com/",
        },
      },
      {
        network: "holesky",
        chainId: 17000,
        urls: {
          apiURL: "https://api-holesky.etherscan.io/api",
          browserURL: "https://holesky.etherscan.io/",
        },
      },
      {
        network: "manta",
        chainId: 169,
        urls: {
          apiURL: "https://pacific-explorer.manta.network/api",
          browserURL: "https://pacific-explorer.manta.network",
        },
      },
      {
        network: "mode",
        chainId: 34443,
        urls: {
          apiURL: "https://explorer.mode.network/api",
          browserURL: "https://explorer.mode.network",
        },
      },
      {
        network: "blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.blastscan.io/api",
          browserURL: "https://blastscan.io/",
        },
      },
    ],
  },
};

export default config;
