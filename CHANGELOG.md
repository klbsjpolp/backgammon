# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [0.1.18](https://github.com/klbsjpolp/backgammon/compare/v0.1.17...v0.1.18) (2026-08-14)
## [0.1.17](https://github.com/klbsjpolp/backgammon/compare/v0.1.16...v0.1.17) (2026-08-14)
## [0.1.16](https://github.com/klbsjpolp/backgammon/compare/v0.1.15...v0.1.16) (2026-08-14)
## [0.1.15](https://github.com/klbsjpolp/backgammon/compare/v0.1.14...v0.1.15) (2026-08-13)

### Features

* **web:** roll automatically for the player who asked not to be asked ([3da88e6](https://github.com/klbsjpolp/backgammon/commit/3da88e67e5d88943072a7e770b448cd3abad7188))
## [0.1.14](https://github.com/klbsjpolp/backgammon/compare/v0.1.13...v0.1.14) (2026-08-13)
## [0.1.13](https://github.com/klbsjpolp/backgammon/compare/v0.1.12...v0.1.13) (2026-08-13)
## [0.1.12](https://github.com/klbsjpolp/backgammon/compare/v0.1.11...v0.1.12) (2026-08-13)

### Bug Fixes

* **web:** bigger dice on phones, stacks that pile as they grow, no confirm after game over ([5732eba](https://github.com/klbsjpolp/backgammon/commit/5732eba84e1db2bb79f6462cf830c8d98f152722))
## [0.1.11](https://github.com/klbsjpolp/backgammon/compare/v0.1.10...v0.1.11) (2026-08-13)

### Features

* **web:** make the board readable by keyboard and screen reader ([dc726f0](https://github.com/klbsjpolp/backgammon/commit/dc726f0c324e9b840b3f35d678dc193ea35da18e))

### Bug Fixes

* **core:** reject a die that is not among the remaining ones ([006a3f0](https://github.com/klbsjpolp/backgammon/commit/006a3f0f684b8e23dd8673f37a77d6a7790825f0)), references [#18](https://github.com/klbsjpolp/backgammon/issues/18)
* **core:** reject illegal moves and stop discarding unplayable rolls ([a0e6e6a](https://github.com/klbsjpolp/backgammon/commit/a0e6e6ab8a918d0706d1505a4cef8933ad43975c))
* **runtime:** accept older frames, and refuse snapshots that cannot be resumed ([03885bc](https://github.com/klbsjpolp/backgammon/commit/03885bced0ebfe5d1be3f8bdc714f711850e784c)), references [#18](https://github.com/klbsjpolp/backgammon/issues/18)
* **web:** announce from a live region that is already there ([d265423](https://github.com/klbsjpolp/backgammon/commit/d2654233598e21d0dc65a68ce05febcadad2ea09)), references [#18](https://github.com/klbsjpolp/backgammon/issues/18)
* **web:** parse runtime-config instead of casting it ([9d9f564](https://github.com/klbsjpolp/backgammon/commit/9d9f5643d277b4447fd24b69ec7971234e08325f))
* **web:** validate relayed state and stop a bad frame blanking the page ([dc432b8](https://github.com/klbsjpolp/backgammon/commit/dc432b8c437a55173a43c8259b9cbf4b42e10cb5))
## [0.1.10](https://github.com/klbsjpolp/backgammon/compare/v0.1.9...v0.1.10) (2026-08-12)
## [0.1.9](https://github.com/klbsjpolp/backgammon/compare/v0.1.8...v0.1.9) (2026-08-12)

### Features

* **web:** move the dice into the header row beside the title ([dd4f2f9](https://github.com/klbsjpolp/backgammon/commit/dd4f2f9c8bccf8afac01be80c497c49087212d74))
## [0.1.8](https://github.com/klbsjpolp/backgammon/compare/v0.1.7...v0.1.8) (2026-08-12)

### Bug Fixes

* **web:** give the board the room a phone actually has ([ea23f3c](https://github.com/klbsjpolp/backgammon/commit/ea23f3c232f677e2266b1943f7dd601a57b156c2))
## [0.1.7](https://github.com/klbsjpolp/backgammon/compare/v0.1.6...v0.1.7) (2026-08-12)

### Features

* **web:** add a theme system with three themes and a persistent switcher ([2164e41](https://github.com/klbsjpolp/backgammon/commit/2164e41ed69c07d7741eaa33e5c5f6e8bfacbf2d))

### Bug Fixes

* **web:** carry the theme layer through main's update flow ([48147a8](https://github.com/klbsjpolp/backgammon/commit/48147a84329604256eff9aee5c226dfa75338f50))
* **web:** meet 3:1 contrast on the board and keep the header to one row ([4808296](https://github.com/klbsjpolp/backgammon/commit/480829617474070d9434c92bd8639b96860b736c)), references [#c89a63](https://github.com/klbsjpolp/backgammon/issues/c89a63) [#b08b57](https://github.com/klbsjpolp/backgammon/issues/b08b57) [#6a3f1d](https://github.com/klbsjpolp/backgammon/issues/6a3f1d)
## [0.1.6](https://github.com/klbsjpolp/backgammon/compare/v0.1.5...v0.1.6) (2026-08-11)
## [0.1.5](https://github.com/klbsjpolp/backgammon/compare/v0.1.4...v0.1.5) (2026-08-11)

### Features

* **web:** show the version and update the app in place ([a2dcf8b](https://github.com/klbsjpolp/backgammon/commit/a2dcf8baec4f4831086111143f4b11689dba973c))
## [0.1.4](https://github.com/klbsjpolp/backgammon/compare/v0.1.3...v0.1.4) (2026-08-11)
## [0.1.3](https://github.com/klbsjpolp/backgammon/compare/v0.1.2...v0.1.3) (2026-08-11)
## [0.1.2](https://github.com/klbsjpolp/backgammon/compare/v0.1.1...v0.1.2) (2026-08-11)
## 0.1.1 (2026-08-11)

### Features

* backgammon game (core + runtime + web) on the shared stack ([d95b5be](https://github.com/klbsjpolp/backgammon/commit/d95b5be8636abb4b7f425541e97361de4c0c51fe))
* online multiplayer + stronger AI ([6cd9d6b](https://github.com/klbsjpolp/backgammon/commit/6cd9d6b07ade88da06c04e5679871bc88e3b4bb1))
* **web:** make the board playable on a phone ([6582cb6](https://github.com/klbsjpolp/backgammon/commit/6582cb6b461e1f6aa888872767ab3f9a9007d20e))

### Bug Fixes

* let black bear off, give the AI a cube strategy, cover the web layer ([0ff5867](https://github.com/klbsjpolp/backgammon/commit/0ff586752efe35f4a8c21f5f8e94e2d0d4b2aee5))
* **web:** keep the checker count sized, and announce the confirm state ([beb7e32](https://github.com/klbsjpolp/backgammon/commit/beb7e329b01e1ed4a7f2c68c57c2285020beb710))
