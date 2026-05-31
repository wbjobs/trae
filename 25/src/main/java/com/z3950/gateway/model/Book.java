package com.z3950.gateway.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Book {
    private String title;
    private String author;
    private String isbn;
    private List<String> sourceServers;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        Book book = (Book) o;
        if (isbn != null && !isbn.isEmpty() && book.isbn != null && !book.isbn.isEmpty()) {
            return normalizeIsbn(isbn).equals(normalizeIsbn(book.isbn));
        }
        if (title != null && author != null) {
            return normalizeString(title).equals(normalizeString(book.title)) &&
                   normalizeString(author).equals(normalizeString(book.author));
        }
        return false;
    }

    @Override
    public int hashCode() {
        if (isbn != null && !isbn.isEmpty()) {
            return normalizeIsbn(isbn).hashCode();
        }
        if (title != null && author != null) {
            return (normalizeString(title) + "|" + normalizeString(author)).hashCode();
        }
        return super.hashCode();
    }

    private String normalizeIsbn(String isbn) {
        return isbn.replaceAll("[^0-9X]", "").toUpperCase();
    }

    private String normalizeString(String s) {
        return s.trim().toLowerCase().replaceAll("\\s+", " ");
    }
}
