package com.lab.product;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/** In-memory catalogue - the point of the lab is the infrastructure, not the database. */
@Component
public class ProductCatalog {

    public record Product(int id, String name, String category, double price, int stock, String description) {
    }

    public record Review(int productId, String author, int stars, String comment) {
    }

    private final List<Product> products = List.of(
            new Product(1, "Mechanical Keyboard", "peripherals", 89.99, 42, "Hot-swappable switches, aluminium case, per-key RGB"),
            new Product(2, "4K Monitor 27\"", "displays", 329.00, 12, "IPS panel, 144 Hz, USB-C power delivery"),
            new Product(3, "Ergonomic Mouse", "peripherals", 49.50, 80, "Vertical grip, 6 buttons, 2.4 GHz + Bluetooth"),
            new Product(4, "USB-C Dock", "accessories", 119.00, 25, "11-in-1: HDMI, DisplayPort, Ethernet, SD card"),
            new Product(5, "Noise-Cancelling Headset", "audio", 199.99, 18, "40 h battery, dual microphones, multipoint"),
            new Product(6, "Webcam 1080p", "video", 69.00, 60, "Auto-focus, privacy shutter, stereo mic"),
            new Product(7, "Laptop Stand", "accessories", 39.90, 100, "Foldable aluminium, six height levels"),
            new Product(8, "Portable SSD 1TB", "storage", 94.00, 33, "1050 MB/s, shock-resistant, USB 3.2 Gen 2"));

    private final List<Review> reviews = List.of(
            new Review(1, "asha", 5, "Typing feel is superb"),
            new Review(1, "ravi", 4, "A bit loud for the office"),
            new Review(2, "meera", 5, "Colours are stunning"),
            new Review(3, "kiran", 4, "Great after a week of adjusting"),
            new Review(5, "sana", 5, "ANC is excellent on trains"),
            new Review(8, "john", 5, "Copies my 20 GB repo in seconds"));

    public ProductCatalog(MeterRegistry registry) {
        // A GAUGE reports a value that goes up AND down. Micrometer calls this lambda on every Prometheus scrape.
        Gauge.builder("lab.inventory.total.stock", products, list -> list.stream().mapToInt(Product::stock).sum())
                .description("Total units in stock across all products")
                .register(registry);
    }

    public List<Product> findAll() {
        return products;
    }

    public Optional<Product> findById(int id) {
        return products.stream().filter(p -> p.id() == id).findFirst();
    }

    public List<Review> reviewsFor(int productId) {
        return reviews.stream().filter(r -> r.productId() == productId).toList();
    }
}
