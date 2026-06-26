(function () {
  const specs = [
    "Product: AgCl Electrode",
    "Manufacturer: GaossUnion",
    "Part number: 1060",
    "Model number: R1060",
    "Dimensions: 11 x 0.6 x 0.6 cm",
    "Internal resistance: <=10KOhm",
    "Standard potential at 25C: 0.198V",
    "Included components: Silver chloride electrode and user manual",
    "Use notes: Fill with saturated KCl solution. Use a salt bridge for acidic or alkaline systems."
  ];

  const form = document.querySelector("#inquiryForm");
  const status = document.querySelector("#inquiryStatus");
  const downloadSheet = document.querySelector("#downloadSheet");
  const copySpecs = document.querySelector("#copySpecs");
  const printPage = document.querySelector("#printPage");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    data.product = "AgCl Electrode";
    data.savedAt = new Date().toISOString();
    localStorage.setItem("agclInquiryDraft", JSON.stringify(data));
    status.textContent = "Inquiry draft saved locally.";
  });

  downloadSheet.addEventListener("click", () => {
    const blob = new Blob([specs.join("\n")], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "agcl-electrode-product-sheet.txt";
    link.click();
    URL.revokeObjectURL(link.href);
  });

  copySpecs.addEventListener("click", async () => {
    const text = specs.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      copySpecs.textContent = "Copied";
      setTimeout(() => {
        copySpecs.textContent = "Copy specs";
      }, 1600);
    } catch {
      window.prompt("Copy product specs", text);
    }
  });

  printPage.addEventListener("click", () => {
    window.print();
  });
})();
