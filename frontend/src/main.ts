import { v4 as uuidv4 } from "uuid";

document.querySelector<HTMLDivElement>("#app")!;

const fileInput = document.querySelector<HTMLInputElement>("#fileInput")!;
const uploadBtn = document.querySelector<HTMLButtonElement>("#uploadBtn")!;

uploadBtn.addEventListener("click", async () => {
  try {
    if (!fileInput.files || fileInput.files.length === 0) {
      alert("Please select a file");
      return;
    }

    const file = fileInput.files[0];
    const initFormData = new FormData();
    const userId: string = localStorage.getItem("userId")!;
    const size: number = file.size;
    const numberOfParts = Math.ceil((size / (1024 * 1024)) / 5);

    initFormData.append("file_id", uuidv4());
    initFormData.append("file_name", file.name);
    initFormData.append("file_size", size.toString());
    initFormData.append("user_id", userId);
    initFormData.append("file_type", file.type);
    initFormData.append("s3_key", "something something");

    const init = await fetch("http://localhost:50136/api/files/upload-init", {
      method: "POST",
      body: initFormData,
    });

    const init_res = await init.json();
    if (!init_res.success || !init_res.UploadId) throw new Error("some error");

    const psurlFormData = new FormData();
    psurlFormData.append("uploadId", init_res.UploadId);
    psurlFormData.append("numberOfParts", numberOfParts.toString());

    const psurl = await fetch("http://localhost:50136/api/files/presigned-url", {
      method: "POST",
      body: psurlFormData
    });

    const psurl_res = await psurl.json();
    const urls: string[] = psurl_res.presignedUrls;

    // fetch(url, {} ); -> upload chunks to their respective urls -> will return { res.headers.('etag') || res.headers.('Etag') & PartNumber } of type UploadResult[]

    // then, compare the Etags!!
  } catch (err) {
    console.error(err);
    alert("Upload failed");
  }
});
