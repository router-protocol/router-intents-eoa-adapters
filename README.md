# Router's Cross-Chain Intents Framework Adapters

Welcome to the Cross-Chain Intents Framework Adapters repository. This repository contains adapters for various decentralized applications (dapps) on EVM and Tron chains, implemented for Router's Cross-Chain Intents Framework.

## Introduction

Router's Cross-Chain Intents Framework aims to simplify cross-chain interactions by providing a unified interface for developers. This repository contains adapters that enable various dapps to communicate across different blockchain networks.

## Prerequisites

To use these adapters, you need:

- Node.js (v16 or later)
- npm or yarn

## Installation

1. Clone the repository to your local machine:

```bash
git clone https://github.com/router-protocol/router-intents-eoa-adapters.git
cd router-intents-eoa-adapters
```

2. Change directory to one of the folders `evm` or `tron`
3. Install dependencies using `npm install` or `yarn`
4. Follow the instructions in the readme of the folder to test and deploy these adapters

# Contributing a New Adapter to the Repository

## Overview

If you'd like to contribute a new adapter, please follow these steps to ensure a smooth integration process. This checklist helps maintain code quality, consistency, and proper documentation.

## Steps to Contribute a New Adapter

- [ ] **Fork the Repository**

  - Click the "Fork" button at the top-right corner of this repository to create your copy.
  - Clone your fork to your local development environment.

- [ ] **Add Your Adapter Code**

  - Create a new branch in your fork for your changes.
  - Add your adapter code in the appropriate location within the repository.

- [ ] **Add Deployment Script**

  - Ensure that your adapter has a proper deployment script for automated or manual deployment.
  - Test the deployment script to confirm it works as expected.

- [ ] **Write Tests**

  - Add comprehensive tests for your adapter to ensure it functions correctly.
  - Include unit tests, integration tests, or other relevant tests to validate your code.

- [ ] **Document the Purpose of the Adapter**

  - Add a small documentation section in your PR describing the purpose and use case for your adapter.
  - Mention any specific instructions or dependencies for using the adapter.

- [ ] **Raise a Pull Request**
  - Once your code, deployment script, tests, and documentation are complete, raise a PR to the original repository.
  - Include a clear title and description of your PR, outlining the changes you've made.
  - Request reviews from repository maintainers or designated reviewers.

## Review and Merge Process

- [ ] **Review by Maintainers**

  - Repository maintainers will review your PR to ensure it meets the project's standards.
  - Address any feedback or requested changes before merging.

- [ ] **Merge the Pull Request**
  - Once the PR is approved, it will be merged into the default branch.
  - The changes will be deployed as part of the project's next release.
