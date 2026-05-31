package com.ota.platform.security;

import java.io.*;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class DeltaUtils {

    private static final int BLOCK_SIZE = 4096;
    private static final int HASH_SIZE = 32;

    public static class DeltaBlock {
        public int type;
        public int offset;
        public int length;
        public byte[] data;

        public DeltaBlock(int type, int offset, int length, byte[] data) {
            this.type = type;
            this.offset = offset;
            this.length = length;
            this.data = data;
        }
    }

    public static byte[] generateDelta(byte[] oldData, byte[] newData) throws IOException {
        List<DeltaBlock> blocks = generateDeltaBlocks(oldData, newData);
        return serializeDelta(blocks, newData.length);
    }

    public static byte[] applyDelta(byte[] oldData, byte[] deltaData) throws IOException {
        DeltaHeader header = parseDeltaHeader(deltaData);
        List<DeltaBlock> blocks = parseDeltaBlocks(deltaData, 12);
        return reconstructData(oldData, blocks, header.newSize);
    }

    private static List<DeltaBlock> generateDeltaBlocks(byte[] oldData, byte[] newData) {
        List<DeltaBlock> blocks = new ArrayList<>();
        int oldPos = 0;
        int newPos = 0;

        while (newPos < newData.length) {
            int[] match = findBestMatch(oldData, newData, oldPos, newPos);
            
            if (match[0] > 0) {
                blocks.add(new DeltaBlock(1, match[1], match[0], null));
                oldPos = match[1] + match[0];
                newPos += match[0];
            } else {
                int addLength = Math.min(BLOCK_SIZE, newData.length - newPos);
                byte[] addData = Arrays.copyOfRange(newData, newPos, newPos + addLength);
                blocks.add(new DeltaBlock(0, 0, addLength, addData));
                newPos += addLength;
            }
        }

        return blocks;
    }

    private static int[] findBestMatch(byte[] oldData, byte[] newData, int oldStart, int newStart) {
        int bestMatchLength = 0;
        int bestMatchOffset = -1;

        for (int i = oldStart; i < oldData.length - 64; i++) {
            int matchLen = countMatch(oldData, i, newData, newStart);
            if (matchLen > bestMatchLength) {
                bestMatchLength = matchLen;
                bestMatchOffset = i;
                if (bestMatchLength >= BLOCK_SIZE * 4) {
                    break;
                }
            }
        }

        if (bestMatchLength < 64) {
            return new int[]{0, -1};
        }

        return new int[]{bestMatchLength, bestMatchOffset};
    }

    private static int countMatch(byte[] a, int aStart, byte[] b, int bStart) {
        int count = 0;
        while (aStart + count < a.length && bStart + count < b.length && a[aStart + count] == b[bStart + count]) {
            count++;
        }
        return count;
    }

    private static byte[] serializeDelta(List<DeltaBlock> blocks, int newSize) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        DataOutputStream dos = new DataOutputStream(baos);

        dos.writeInt(0x44454C54);
        dos.writeInt(newSize);
        dos.writeInt(blocks.size());

        for (DeltaBlock block : blocks) {
            dos.writeByte(block.type);
            dos.writeInt(block.offset);
            dos.writeInt(block.length);
            if (block.type == 0 && block.data != null) {
                dos.write(block.data);
            }
        }

        dos.close();
        return baos.toByteArray();
    }

    private static DeltaHeader parseDeltaHeader(byte[] deltaData) throws IOException {
        DataInputStream dis = new DataInputStream(new ByteArrayInputStream(deltaData));
        int magic = dis.readInt();
        if (magic != 0x44454C54) {
            throw new IOException("Invalid delta file format");
        }
        int newSize = dis.readInt();
        int blockCount = dis.readInt();
        dis.close();
        return new DeltaHeader(newSize, blockCount);
    }

    private static List<DeltaBlock> parseDeltaBlocks(byte[] deltaData, int offset) throws IOException {
        List<DeltaBlock> blocks = new ArrayList<>();
        DataInputStream dis = new DataInputStream(new ByteArrayInputStream(deltaData, offset, deltaData.length - offset));

        while (dis.available() > 0) {
            int type = dis.readByte();
            int blockOffset = dis.readInt();
            int length = dis.readInt();
            byte[] data = null;
            if (type == 0) {
                data = new byte[length];
                dis.readFully(data);
            }
            blocks.add(new DeltaBlock(type, blockOffset, length, data));
        }

        dis.close();
        return blocks;
    }

    private static byte[] reconstructData(byte[] oldData, List<DeltaBlock> blocks, int newSize) {
        byte[] result = new byte[newSize];
        int pos = 0;

        for (DeltaBlock block : blocks) {
            if (block.type == 1) {
                System.arraycopy(oldData, block.offset, result, pos, block.length);
            } else if (block.type == 0 && block.data != null) {
                System.arraycopy(block.data, 0, result, pos, block.length);
            }
            pos += block.length;
        }

        return result;
    }

    public static void generateDeltaFile(File oldFile, File newFile, File deltaFile) throws Exception {
        byte[] oldData = readFile(oldFile);
        byte[] newData = readFile(newFile);
        byte[] deltaData = generateDelta(oldData, newData);
        writeFile(deltaFile, deltaData);
    }

    public static void applyDeltaFile(File oldFile, File deltaFile, File outputFile) throws Exception {
        byte[] oldData = readFile(oldFile);
        byte[] deltaData = readFile(deltaFile);
        byte[] newData = applyDelta(oldData, deltaData);
        writeFile(outputFile, newData);
    }

    private static byte[] readFile(File file) throws IOException {
        FileInputStream fis = new FileInputStream(file);
        byte[] data = new byte[(int) file.length()];
        fis.read(data);
        fis.close();
        return data;
    }

    private static void writeFile(File file, byte[] data) throws IOException {
        FileOutputStream fos = new FileOutputStream(file);
        fos.write(data);
        fos.close();
    }

    public static long estimateDeltaSize(File oldFile, File newFile) throws Exception {
        byte[] oldData = readFile(oldFile);
        byte[] newData = readFile(newFile);
        List<DeltaBlock> blocks = generateDeltaBlocks(oldData, newData);
        
        long estimatedSize = 12;
        for (DeltaBlock block : blocks) {
            estimatedSize += 9;
            if (block.type == 0 && block.data != null) {
                estimatedSize += block.data.length;
            }
        }
        return estimatedSize;
    }

    static class DeltaHeader {
        int newSize;
        int blockCount;

        DeltaHeader(int newSize, int blockCount) {
            this.newSize = newSize;
            this.blockCount = blockCount;
        }
    }
}
