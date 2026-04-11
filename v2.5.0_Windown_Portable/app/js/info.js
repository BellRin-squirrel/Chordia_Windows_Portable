document.addEventListener("DOMContentLoaded", async () => {
    const appVersionContainer = document.getElementsByClassName("app-version")[0];
    const appVersion = await eel.getAppVersion()();
    appVersionContainer.textContent = appVersion;
});