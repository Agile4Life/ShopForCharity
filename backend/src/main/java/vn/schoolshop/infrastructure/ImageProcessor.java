package vn.schoolshop.infrastructure;

import static vn.schoolshop.common.ApiException.check;

import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Set;
import javax.imageio.ImageIO;
import org.springframework.stereotype.Component;
import vn.schoolshop.common.ApiException;

@Component
public class ImageProcessor {
  public record Processed(byte[] image, byte[] thumbnail) {}

  public Processed process(byte[] bytes, String mime, boolean qr) {
    check(
        bytes.length > 0 && bytes.length <= 5 * 1024 * 1024,
        413,
        "FILE_TOO_LARGE",
        "Ảnh tối đa 5 MB.");
    check(
        Set.of("image/jpeg", "image/png", "image/webp").contains(mime),
        415,
        "UNSUPPORTED_IMAGE",
        "Chỉ nhận JPEG, PNG, WebP.");
    try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
      var readers = ImageIO.getImageReaders(input);
      check(readers.hasNext(), 415, "INVALID_IMAGE", "Không giải mã được ảnh.");
      var reader = readers.next();
      try {
        reader.setInput(input, true, true);
        String format = reader.getFormatName().toLowerCase();
        check(
            Set.of("jpeg", "jpg", "png", "webp").contains(format)
                && ((mime.equals("image/jpeg") && (format.equals("jpeg") || format.equals("jpg")))
                    || (mime.equals("image/png") && format.equals("png"))
                    || (mime.equals("image/webp") && format.equals("webp"))),
            415,
            "INVALID_IMAGE",
            "Nội dung ảnh không khớp MIME.");
        int w = reader.getWidth(0), h = reader.getHeight(0);
        check(
            w > 0 && h > 0 && w <= 8192 && h <= 8192 && (long) w * h <= 20000000,
            400,
            "IMAGE_DIMENSIONS_EXCEEDED",
            "Ảnh vượt giới hạn kích thước.");
        BufferedImage image = reader.read(0);
        return new Processed(
            png(qr ? image : resize(image, 1600)), qr ? null : png(resize(image, 400)));
      } finally {
        reader.dispose();
      }
    } catch (ApiException e) {
      throw e;
    } catch (IOException e) {
      throw new ApiException(415, "INVALID_IMAGE", "Không giải mã được ảnh.");
    }
  }

  private BufferedImage resize(BufferedImage source, int max) {
    double scale = Math.min(1, (double) max / Math.max(source.getWidth(), source.getHeight()));
    var out =
        new BufferedImage(
            Math.max(1, (int) (source.getWidth() * scale)),
            Math.max(1, (int) (source.getHeight() * scale)),
            BufferedImage.TYPE_INT_ARGB);
    var graphics = out.createGraphics();
    try {
      graphics.setRenderingHint(
          RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
      graphics.drawImage(source, 0, 0, out.getWidth(), out.getHeight(), null);
    } finally {
      graphics.dispose();
    }
    return out;
  }

  private byte[] png(BufferedImage image) throws IOException {
    var out = new ByteArrayOutputStream();
    ImageIO.write(image, "png", out);
    return out.toByteArray();
  }
}
