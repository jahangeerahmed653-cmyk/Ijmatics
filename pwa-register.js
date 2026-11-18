if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("/service-worker.js")
      .then(function () {
        console.log("Ijmatics PWA ready");
      })
      .catch(function (error) {
        console.error("PWA error:", error);
      });
  });
}