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

  // file partitioning 5MB
  getPart(partNumber: number): Blob {
    const start = (partNumber - 1) * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    return this.file.slice(start, end);
  }

  async upload() {
    try {
      const s3Key: string = `dropbox-test/${this.fileId}-${this.file.name}`;
      const userId: string = "8ec22669-d791-4ded-af6c-ff6d9541952c"; // hard coded private key stored in db

      if (!userId) {
        throw new Error("No UserId found in browser's localStorage");
      }

      /**
       * initiates the file upload and returns URLs for uplaoding directly to s3
       * makes a record of the metadata in DB
       */
      const geturl = await fetch("http://localhost:50136/api/files/get-urls", {
        method: "POST",
        // credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: this.fileId,
          file_name: this.file.name,
          file_type: this.file.type,
          file_size: this.file.size.toString(),
          user_id: userId,
          s3_key: s3Key,
        }),
      });

      const geturl_res = await geturl.json();
      const urls: string[] = geturl_res.presignedUrls;
      const uploadId: string = geturl_res.uploadId;
      const uploaded_parts = [];

      /**
       * uploading file parts directly to s3
       */
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
        console.log("RES: \n", res, "\n");
        console.log("INFO: \n", res.headers);

        /**
         * on successfull upload to s3, update that chunk's status to "COMPLETED"
         */
        await fetch("http://localhost:50136/api/files/record-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_id: this.fileId,
            chunk_index: partNumber,
            size: part.size,
            etag: etag,
            s3_key: s3Key,
          }),
        });

        uploaded_parts.push({
          ETag: etag, // checksum for chunk
          PartNumber: partNumber,
        });
      }

      /**
       * stiches together all the uploaded chunks into one file object and signifies that the file upload is successfull
       */
      const comp = await fetch(
        "http://localhost:50136/api/files/complete-upload",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            uploadId,
            parts: uploaded_parts,
            fileId: this.fileId,
          }),
        }
      );

      const comp_res = await comp.json();
      if (!comp_res.success) {
        throw new Error("Failed while uploading the file");
      }
      console.log("Successfully uploaded the file");
      return { success: true };
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
    fileInput.value = "";
    console.log("File upload successfull");
  } catch (err) {
    console.error(err);
    console.log("File upload failed");
  }
});
