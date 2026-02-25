import Cloudinary from "../services/cloudinary.js";
import path from "path";
import multer from "multer";


// create an instance of the Cloudinary class
const cloudinaryStorage = new Cloudinary();

// filter the uploaded images
const filter = (req, file, cb) => {
  const fileTypes = /jpeg|jpg|png|gif|svg|avif|webp/;
  // note:every regex has a test method to check here if the  file extension string contains one of the image file types (jpeg, jpg, png, gif)
  const extnameContainsImageFileType = fileTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  //Note: check if the file mimetype contains one of the image file types(jpeg, jpg, png, gif)
  const mimetypeContainsImageFileType = fileTypes.test(file.mimetype);

  if (extnameContainsImageFileType && mimetypeContainsImageFileType) {
    return cb(null, true);
  } else {
    return cb(new Error("File type not allowed"), false);
  }
};

const maxImageSize = 1024 * 1024 * 6; //6MB

const uploadFile = multer({
  storage: cloudinaryStorage,
  limits: {
    fileSize: maxImageSize,
  },
  fileFilter: filter,
}).single("image"); //image is the name of the image in the formData object I sent client side

export default uploadFile;
