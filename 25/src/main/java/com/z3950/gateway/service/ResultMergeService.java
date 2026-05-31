package com.z3950.gateway.service;

import com.z3950.gateway.model.Book;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

@Slf4j
@Service
public class ResultMergeService {

    public List<Book> mergeAndDeduplicate(List<Book> books) {
        if (books == null || books.isEmpty()) {
            return new ArrayList<>();
        }

        Map<Integer, Book> uniqueBooks = new LinkedHashMap<>();

        for (Book book : books) {
            int key = book.hashCode();
            if (uniqueBooks.containsKey(key)) {
                Book existing = uniqueBooks.get(key);
                mergeBookDetails(existing, book);
            } else {
                uniqueBooks.put(key, book);
            }
        }

        return new ArrayList<>(uniqueBooks.values());
    }

    private void mergeBookDetails(Book existing, Book additional) {
        if (existing.getTitle() == null && additional.getTitle() != null) {
            existing.setTitle(additional.getTitle());
        }

        if (existing.getAuthor() == null && additional.getAuthor() != null) {
            existing.setAuthor(additional.getAuthor());
        }

        if ((existing.getIsbn() == null || existing.getIsbn().isEmpty()) &&
            additional.getIsbn() != null && !additional.getIsbn().isEmpty()) {
            existing.setIsbn(additional.getIsbn());
        }

        if (existing.getSourceServers() == null) {
            existing.setSourceServers(new ArrayList<>());
        }
        if (additional.getSourceServers() != null) {
            for (String source : additional.getSourceServers()) {
                if (!existing.getSourceServers().contains(source)) {
                    existing.getSourceServers().add(source);
                }
            }
        }
    }
}
