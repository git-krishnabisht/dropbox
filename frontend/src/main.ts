import { v4 as uuidv4 } from "uuid";

class FileUploader {
  private file: File;
  private chunkSize: number;
  private numParts: number;
  private fileId: string;

  constructor(file: File, chunkSize: number = 5 * 1024 * 1024) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.numParts = Math.ceil(file.size / chunkSize);
    this.fileId = uuidv4();
  }

  getPart(partNumber: number): Blob {
    const start = (partNumber - 1) * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    return this.file.slice(start, end);
  }

  async upload() {
    try {
      const initFormData = new FormData();
      const s3Key: string = `dropbox-test/${this.fileId}-${this.file.name}`;
      const userId: string = localStorage.getItem("userId")!;

      if (!userId) {
        throw new Error("No UserId found in browser's localStorage");
      }

      initFormData.append("file_id", this.fileId);
      initFormData.append("file_name", this.file.name);
      initFormData.append("file_type", this.file.type);
      initFormData.append("file_size", this.file.size.toString());
      initFormData.append("user_id", userId);
      initFormData.append("s3_key", s3Key);

      const init = await fetch("http://localhost:50136/api/files/upload-init", {
        method: "POST",
        body: initFormData,
      });

      const init_res = await init.json();
      const uploadId = init_res.UploadId;
      if (!init_res.success || !uploadId) {
        throw new Error("File upload initiation failed");
      }

      const psurlFormData = new FormData();
      psurlFormData.append("uploadId", init_res.UploadId);
      psurlFormData.append("numberOfParts", this.numParts.toString());

      const psurl = await fetch(
        "http://localhost:50136/api/files/presigned-url",
        {
          method: "POST",
          body: psurlFormData,
        }
      );

      const psurl_res = await psurl.json();
      const urls: string[] = psurl_res.presignedUrls;
      const uploaded_parts = [];

      for (let i = 0; i < this.numParts; ++i) {
        const partNumber = i + 1;
        const part: Blob = this.getPart(partNumber);

        const res = await fetch(urls[i], {
          method: "PUT",
          body: part,
          headers: {
            "Content-Type": "application/octet-stream",
          },
        });

        if (!res.ok) throw new Error(`Error uploading chunk ${partNumber}`);

        const etag = res.headers.get("etag") || res.headers.get("ETag");
        uploaded_parts.push({
          ETag: etag,
          PartNumber: partNumber,
        });

        const comp = await fetch(
          "http://localhost:50136/api/files/complete-upload",
          {
            method: "POST",
            body: JSON.stringify({ uploadId, parts: uploaded_parts }),
          }
        );

        const comp_res = await comp.json();
        if (!comp_res.success)
          throw new Error("Failed while uploading the file");
        console.log("Successfully uploaded the file");
        return { success: true };
      }
    } catch (err) {
      console.error("Unknown Error: ", err);
      return { success: false };
    }
  }
}

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
    const uploader = new FileUploader(file);

    const result = await uploader.upload();
    if (!result!.success) {
      throw new Error("File upload failed");
    }
    console.log("File upload successfull");
  } catch (err) {
    console.error(err);
    console.log("File upload failed");
  }
});
