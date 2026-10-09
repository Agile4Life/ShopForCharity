package vn.schoolshop.infrastructure;

import static org.junit.jupiter.api.Assertions.*;

import java.awt.image.BufferedImage;
import java.io.*;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import vn.schoolshop.common.ApiException;

class ImageProcessorTest {
  @Test
  void forgedMimeAndSvgAreRejected() {
    var p = new ImageProcessor();
    assertThrows(ApiException.class, () -> p.process("<svg/>".getBytes(), "image/png", false));
    assertThrows(ApiException.class, () -> p.process("<svg/>".getBytes(), "image/svg+xml", false));
  }

  @Test
  void thumbnailAndOutputAreDecodedImages() throws Exception {
    var out = new ByteArrayOutputStream();
    ImageIO.write(new BufferedImage(1800, 600, BufferedImage.TYPE_INT_RGB), "png", out);
    var processed = new ImageProcessor().process(out.toByteArray(), "image/png", false);
    assertEquals(1600, ImageIO.read(new ByteArrayInputStream(processed.image())).getWidth());
    assertEquals(400, ImageIO.read(new ByteArrayInputStream(processed.thumbnail())).getWidth());
    assertThrows(
        ApiException.class,
        () -> new ImageProcessor().process(out.toByteArray(), "image/jpeg", false));
  }
}
