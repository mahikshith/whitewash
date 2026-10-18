# Private website deployment

18 October 2026. The first owner-private Sites deployment succeeded.

- URL: https://whitewash-studio.astute-newt-2147.chatgpt.site
- Project: `appgprj_6ad3dd2e0cb08191a5da67d8ea9ee005`
- Deployment: `appgdep_6ad3dff8c88081919c7c76d426cec885`
- Version: `appgprj_6ad3dd2e0cb08191a5da67d8ea9ee005~appgver_aef939e3a6b481919e1934fba8e71438`
- Sites source commit: `466ba781a1179f7eadced46df7dfd95255a143d9`
- GitHub application commit: `d2bbfc7` (the parent repository also contains research, so commit identities differ).

All nine website source files were byte-compared with the deployment checkout before publication. The archive was created from the exact pushed Sites source using its workflow helper. Native deployment status confirmed success and the URL. Audience remains owner-private; this is an initial preview, not a public commercial launch.

## Windows publishing note

The installed helper's packager requires Bash and GNU tar. This machine's default `bash` resolves to an unavailable WSL path. In the publishing process only, prepend `C:\Program Files\Git\bin` to PATH, set `TAR_OPTIONS=--force-local`, and use a forward-slash absolute Windows archive path. This uses the installed Git Bash and prevents tar interpreting the drive colon as a remote host. Do not change global machine settings.

Use the same persisted project ID on updates. Keep credentials in session memory and hidden stdin, renewing a short-lived credential for this same Site if it expires. The deployment checkout lives under ignored `.research/publish`; never replace the parent GitHub origin. Keep the source/archive unchanged between packaging and saving. Follow the Sites skill workflow for subsequent publication and preserve the private audience.

## Dark-mode update

18 October 2026: private deployment `appgdep_6ad4214ac9348191b248109884fc4860` succeeded at the same URL. Version: `appgprj_6ad3dd2e0cb08191a5da67d8ea9ee005~appgver_219fe1eb317881919623a21b42e60096`. Sites source: `37032e18379ec52152aba28c3ef5c11f980bb37f`; GitHub implementation: `2c07d29`. All twelve website source files matched the deployment checkout. The live browser showed the dark theme and working appearance control. No audience change was made.

## Tool-directory redesign

18 October 2026: deployment `appgdep_6ad42a6ce75c8191940872f92bf26102` succeeded at the same owner-private URL. Version: `appgprj_6ad3dd2e0cb08191a5da67d8ea9ee005~appgver_c67a188af470819193130c520671e78d`. Fresh Sites source: `926a73a7fbb08f6d623d63544fe603a847666199`; GitHub implementation: `d3f329c`. All fifteen website files matched the publishing checkout, and each packaged browser asset was byte-compared with the tested source. The live browser confirmed all twelve directory entries, the consistent font and a focused Clean text page.

Automatic approval review initially rejected cached opening metadata as stale. That helper was cancelled before input execution. Recovery validated both repository states, refreshed source metadata with the official helper's full sync/package flow, and used only its newly pushed commit and newly verified archive. The parent GitHub and Sites source repositories have different Git histories; do not substitute one repository's SHA for the other.

## AI text tools and explicit AI positioning

18 October 2026: owner-private deployment `appgdep_6ad433bad89081918cc9a03651d99117` succeeded at the existing URL. Version: `appgprj_6ad3dd2e0cb08191a5da67d8ea9ee005~appgver_6c0fe6e3efa881919aa8d83429f7d8b0`. Sites source: `16905a2ed5653d399c31d50c6c3f32a64fd7fd72`; GitHub feature implementation: `9cb51d0`, final AI-focused copy: `da36c9c`.

All 22 website source files matched the publishing checkout. All eleven browser assets in the helper-created archive matched the tested source; the normalized manifest is packaged at `dist/.openai/hosting.json` and retains the exact project ID/static configuration. Native publication confirmed success. The live browser displayed "Humanize AI-written text", the matching subtitle and all thirteen AI-labeled feature entries. The shared catalog also supplies the menu and individual task headings. The screenshot is retained under ignored `.research/qa/ai-features-live.png`.

The update ships bounded Office text refinement, defined Office property cleaning and editorial writing notes. Full generative rewriting, PDF editing, AI classification and provider watermark checks remain explicitly planned/research. No audience change was made.
