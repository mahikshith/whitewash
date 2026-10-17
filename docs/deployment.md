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
