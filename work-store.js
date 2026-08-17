(function () {
  "use strict";

  const databaseName = "chained-works";
  const databaseVersion = 1;
  const worksStoreName = "works";
  let databasePromise = null;


  function createId(prefix = "work") {
    const uniquePart =
      window.crypto?.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return `${prefix}-${uniquePart}`;
  }


  function createSeedWorks() {
    const seedTime = Date.now();

    return [
      {
        id: "seed-the-new-order-i",
        title: "THE NEW ORDER I",
        year: "2026",
        workType: "single-work",
        format: "installation",
        materials: "PAPER, WOOD, EPOXY, ACRYLIC GEL",
        height: "28.4",
        width: "19.8",
        depth: "3",
        dimensionUnit: "cm",
        duration: "",
        edition: "",
        description: "",
        collaboratorName: "",
        collaboratorUrl: "",
        photoCreditName: "",
        photoCreditUrl: "",
        visibility: "published",
        images: [
          {
            id: "seed-image-the-new-order-i",
            filename: "the-new-order-i.jpg",
            mimeType: "image/jpeg",
            size: 607643,
            blob: null,
            src: "assets/peer-vink/the-new-order-i.jpg",
            order: 0,
            isCover: true
          }
        ],
        createdAt: new Date(seedTime - 3000).toISOString(),
        updatedAt: new Date(seedTime - 3000).toISOString()
      },
      {
        id: "seed-hey-man",
        title: "HEY MAN",
        year: "2026",
        workType: "installation",
        format: "installation",
        materials: "STYROFOAM, WOOD, ALUMINIUM, OIL PAINT, PLASTER, STEEL",
        height: "",
        width: "",
        depth: "",
        dimensionUnit: "cm",
        duration: "",
        edition: "",
        description: "",
        collaboratorName: "",
        collaboratorUrl: "",
        photoCreditName: "",
        photoCreditUrl: "",
        visibility: "published",
        images: [
          {
            id: "seed-image-hey-man",
            filename: "hey-man.jpg",
            mimeType: "image/jpeg",
            size: 457495,
            blob: null,
            src: "assets/peer-vink/hey-man.jpg",
            order: 0,
            isCover: true
          }
        ],
        createdAt: new Date(seedTime - 2000).toISOString(),
        updatedAt: new Date(seedTime - 2000).toISOString()
      },
      {
        id: "seed-hedo-maxxing-alpha",
        title: "HEDO MAXXING ALPHA",
        year: "2026",
        workType: "single-work",
        format: "",
        materials: "WOOD, PAPER, EPOXY, ALUMINIUM, STUDS",
        height: "14.8",
        width: "21",
        depth: "3",
        dimensionUnit: "cm",
        duration: "",
        edition: "",
        description: "",
        collaboratorName: "",
        collaboratorUrl: "",
        photoCreditName: "",
        photoCreditUrl: "",
        visibility: "published",
        images: [
          {
            id: "seed-image-hedo-maxxing-alpha",
            filename: "archive-06.svg",
            mimeType: "image/svg+xml",
            size: 260,
            blob: null,
            src: "assets/archive-06.svg",
            order: 0,
            isCover: true
          }
        ],
        createdAt: new Date(seedTime - 1000).toISOString(),
        updatedAt: new Date(seedTime - 1000).toISOString()
      }
    ];
  }


  function normaliseImages(images = []) {
    const orderedImages = [...images]
      .sort((first, second) => first.order - second.order)
      .map((image, index) => ({
        id: image.id || createId("image"),
        filename: image.filename || "image",
        mimeType: image.mimeType || image.blob?.type || "",
        size: Number(image.size) || image.blob?.size || 0,
        blob: image.blob || null,
        src: image.src || "",
        order: index,
        isCover: Boolean(image.isCover)
      }));

    if (orderedImages.length === 0) {
      return orderedImages;
    }

    const coverIndex = orderedImages.findIndex((image) => image.isCover);

    if (coverIndex > 0) {
      const [coverImage] = orderedImages.splice(coverIndex, 1);
      orderedImages.unshift(coverImage);
    }

    orderedImages.forEach((image, index) => {
      image.order = index;
      image.isCover = index === 0;
    });

    return orderedImages;
  }


  function materialValues(value) {
    const seen = new Set();
    const values = [];

    const append = (source) => {
      if (Array.isArray(source)) {
        source.forEach(append);
        return;
      }
      String(source || "").split(",").forEach((entry) => {
        const term = entry.trim();
        const normalized = term.toLocaleLowerCase();
        if (!term || seen.has(normalized)) return;
        seen.add(normalized);
        values.push(term);
      });
    };

    append(value);
    return values;
  }


  function unifiedMaterials(work) {
    const source = Object.hasOwn(work || {}, "materials")
      ? work.materials
      : [work?.primaryMedium, work?.supportBase, work?.additionalMaterials];
    return materialValues(source).join(", ");
  }


  function withUnifiedMaterials(work) {
    if (!work) return null;
    const values = materialValues(Object.hasOwn(work, "materials")
      ? work.materials
      : [work.primaryMedium, work.supportBase, work.additionalMaterials]);
    return {
      ...work,
      materials: values.join(", "),
      materialTerms: values.map((value) => value.toLocaleLowerCase())
    };
  }


  function normaliseWork(work, existingWork = null) {
    const now = new Date().toISOString();
    const materials = unifiedMaterials(work);
    const materialTerms = materialValues(materials).map((value) => value.toLocaleLowerCase());

    return {
      id: work.id || existingWork?.id || createId(),
      title: work.title || "",
      year: work.year || "",
      workType: work.workType || "",
      format: work.format || "",
      materials,
      materialTerms,
      height: work.height || "",
      width: work.width || "",
      depth: work.depth || "",
      dimensionUnit: work.dimensionUnit || "cm",
      duration: work.duration || "",
      edition: work.edition || "",
      description: work.description || "",
      collaboratorName: work.collaboratorName || "",
      collaboratorUrl: work.collaboratorUrl || "",
      photoCreditName: work.photoCreditName || "",
      photoCreditUrl: work.photoCreditUrl || "",
      visibility: work.visibility === "published" ? "published" : "draft",
      images: normaliseImages(work.images),
      createdAt: existingWork?.createdAt || work.createdAt || now,
      updatedAt: now
    };
  }


  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result), {
        once: true
      });
      request.addEventListener("error", () => reject(request.error), {
        once: true
      });
    });
  }


  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.addEventListener("complete", resolve, { once: true });
      transaction.addEventListener(
        "abort",
        () => reject(transaction.error || new Error("Transaction aborted.")),
        { once: true }
      );
      transaction.addEventListener(
        "error",
        () => reject(transaction.error || new Error("Transaction failed.")),
        { once: true }
      );
    });
  }


  function initialiseDatabase() {
    if (databasePromise) {
      return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is not available in this browser."));
        return;
      }

      const request = indexedDB.open(databaseName, databaseVersion);

      request.addEventListener("upgradeneeded", (event) => {
        const database = request.result;

        if (!database.objectStoreNames.contains(worksStoreName)) {
          const store = database.createObjectStore(worksStoreName, {
            keyPath: "id"
          });

          store.createIndex("updatedAt", "updatedAt", { unique: false });
          store.createIndex("visibility", "visibility", { unique: false });

          if (event.oldVersion === 0) {
            createSeedWorks().forEach((work) => store.add(work));
          }
        }
      });

      request.addEventListener("success", () => {
        const database = request.result;

        database.addEventListener("versionchange", () => {
          database.close();
          databasePromise = null;
        });

        resolve(database);
      });

      request.addEventListener("error", () => {
        databasePromise = null;
        reject(request.error || new Error("Could not open work storage."));
      });

      request.addEventListener("blocked", () => {
        console.error("CHAINED work storage upgrade is blocked.");
      });
    });

    return databasePromise;
  }


  async function getAllWorks() {
    const database = await initialiseDatabase();
    const transaction = database.transaction(worksStoreName, "readonly");
    const completion = transactionComplete(transaction);
    const request = transaction.objectStore(worksStoreName).getAll();
    const works = await requestResult(request);

    await completion;

    return works.map(withUnifiedMaterials).sort(
      (first, second) =>
        new Date(second.updatedAt).getTime() -
        new Date(first.updatedAt).getTime()
    );
  }


  async function getWork(id) {
    const database = await initialiseDatabase();
    const transaction = database.transaction(worksStoreName, "readonly");
    const completion = transactionComplete(transaction);
    const request = transaction.objectStore(worksStoreName).get(id);
    const work = await requestResult(request);

    await completion;

    return withUnifiedMaterials(work);
  }


  async function createWork(work) {
    const database = await initialiseDatabase();
    const record = normaliseWork(work);
    const transaction = database.transaction(worksStoreName, "readwrite");

    transaction.objectStore(worksStoreName).add(record);
    await transactionComplete(transaction);

    return record;
  }


  async function updateWork(work) {
    if (!work?.id) {
      throw new Error("A work ID is required to update a record.");
    }

    const existingWork = await getWork(work.id);

    if (!existingWork) {
      throw new Error(`Work ${work.id} could not be found.`);
    }

    const database = await initialiseDatabase();
    const record = normaliseWork(work, existingWork);
    const transaction = database.transaction(worksStoreName, "readwrite");

    transaction.objectStore(worksStoreName).put(record);
    await transactionComplete(transaction);

    return record;
  }


  async function deleteWork(id) {
    const database = await initialiseDatabase();
    const transaction = database.transaction(worksStoreName, "readwrite");

    transaction.objectStore(worksStoreName).delete(id);
    await transactionComplete(transaction);
  }


  window.ChainedWorkStore = Object.freeze({
    initialiseDatabase,
    getAllWorks,
    getWork,
    createWork,
    updateWork,
    deleteWork
  });
})();
