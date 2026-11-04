const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const LIBS_DIR = 'mobile/modules/meta-wearables/android/libs';
const INPUT_AAR = 'mwdat-core-0.3.0.aar';
const OUTPUT_AAR = 'mwdat-core-0.3.0-stripped.aar';

const inputPath = path.join(process.cwd(), LIBS_DIR, INPUT_AAR);
const outputPath = path.join(process.cwd(), LIBS_DIR, OUTPUT_AAR);

if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input AAR not found at ${inputPath}`);
    process.exit(1);
}

try {
    console.log(`Reading ${INPUT_AAR}...`);
    const aarZip = new AdmZip(inputPath);
    const aarEntries = aarZip.getEntries();

    const classesJarEntry = aarEntries.find((entry) => entry.entryName === 'classes.jar');

    if (!classesJarEntry) {
        console.error('Error: classes.jar not found in AAR');
        process.exit(1);
    }

    console.log('Extracting and processing classes.jar...');
    const classesJarBuffer = classesJarEntry.getData();
    const jarZip = new AdmZip(classesJarBuffer);
    const jarEntries = jarZip.getEntries();

    let deletedCount = 0;

    // Create new JAR content
    const newJarZip = new AdmZip();

    jarEntries.forEach((entry) => {
        if (entry.entryName.startsWith('com/facebook/jni/')) {
            console.log(`Removing ${entry.entryName}`);
            deletedCount++;
        } else {
            newJarZip.addFile(entry.entryName, entry.getData());
        }
    });

    if (deletedCount === 0) {
        console.warn('Warning: No conflicting com.facebook.jni classes found to remove.');
    } else {
        console.log(`Removed ${deletedCount} conflicting files from classes.jar`);
    }

    const newJarBuffer = newJarZip.toBuffer();

    // Update AAR with new classes.jar
    aarZip.updateFile('classes.jar', newJarBuffer);

    console.log(`Writing ${OUTPUT_AAR}...`);
    aarZip.writeZip(outputPath);
    console.log('Success! Patched AAR created.');
} catch (err) {
    console.error('Error processing AAR:', err);
    process.exit(1);
}
