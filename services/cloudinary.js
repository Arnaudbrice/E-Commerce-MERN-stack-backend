import { v2 as cloudinary } from "cloudinary";

class Cloudinary {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  // this method is called under the hood by multer to handle the file upload using the cloudinary storage engine ( Multer usually won’t call _handleFile if no file exists)
  _handleFile(req, file, cb) {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        folder: "fullstack-ecommerce",
      },
      (error, result) => {
        if (error) {
          cb(error);
        } else {
          cb(null, result);
        }
      }
    );

    file.stream.pipe(uploadStream);
  }

  // this method is called under the hood by multer to handle the file deletion using the cloudinary storage engine
  _removeFile(req, file, cb) {
    cloudinary.uploader.destroy(file.public._id, (error, result) => {
      if (error) {
        cb(error);
      } else {
        cb(null, result);
      }
    });
  }
}

export default Cloudinary;
