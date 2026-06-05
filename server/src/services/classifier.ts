import * as fs from 'fs';
import * as path from 'path';

let classifierPipeline: any = null;

/**
 * Initializes the AI image classification pipeline using transformers.js.
 * Uses a dynamic import to support CommonJS transpilation compatibility.
 */
async function getClassifier() {
  if (classifierPipeline) {
    return classifierPipeline;
  }

  // Dynamic import helper to load ESM in CommonJS without TS compiler translation
  const { pipeline, env } = await (eval('import("@huggingface/transformers")') as Promise<any>);
  
  // Configure cache directory inside the workspace root to keep the system self-contained
  // This file is in server/src/services/classifier.ts, so three directories up is workspace root.
  const workspaceDir = path.resolve(__dirname, '../../../');
  env.cacheDir = path.join(workspaceDir, '.model_cache');
  
  // We use a small, fast MobileNet model (MobileNetV4 Conv Small is ~12MB)
  classifierPipeline = await pipeline(
    'image-classification', 
    'onnx-community/mobilenetv4_conv_small.e2400_r224_in1k'
  );
  return classifierPipeline;
}

/**
 * Maps an ImageNet label string to our target categories.
 */
function mapLabelToCategory(label: string): string {
  const normalized = label.toLowerCase();
  
  // Keyword mappings
  const mapping = {
    'Vehicles': [
      'car', 'automobile', 'cab', 'taxi', 'truck', 'bus', 'vehicle', 'van', 'ambulance', 'jeep', 
      'limo', 'motorcycle', 'scooter', 'bike', 'bicycle', 'train', 'locomotive', 'tram', 'plane', 
      'airplane', 'aircraft', 'helicopter', 'ship', 'boat', 'yacht', 'canoe', 'ferry', 'submarine', 'wheelbarrow'
    ],
    'People & Portraits': [
      'person', 'man', 'woman', 'child', 'baby', 'boy', 'girl', 'groom', 'bride', 'people', 'crowd', 
      'face', 'portrait', 'suit', 'military', 'diver', 'soldier', 'dress', 'clothing', 'cloak', 'coat', 't-shirt'
    ],
    'Nature & Landscapes': [
      'alp', 'cliff', 'valley', 'mountain', 'hill', 'lakeshore', 'seashore', 'beach', 'sandbar', 
      'promontory', 'geyser', 'volcano', 'coral reef', 'forest', 'wood', 'tree', 'plant', 'flower', 
      'daisy', 'rose', 'tulip', 'garden', 'sky', 'cloud', 'sunset', 'sunrise', 'grass'
    ],
    'Animals': [
      'dog', 'cat', 'bird', 'fish', 'horse', 'cow', 'sheep', 'pig', 'goat', 'lion', 'tiger', 
      'bear', 'wolf', 'fox', 'deer', 'rabbit', 'mouse', 'rat', 'elephant', 'monkey', 'ape', 
      'spider', 'snake', 'frog', 'turtle', 'lizard', 'dinosaur'
    ],
    'Documents & Diagrams': [
      'website', 'web site', 'screen', 'monitor', 'television', 'projector', 'scoreboard', 'menu', 
      'envelope', 'notebook', 'book jacket', 'comic book', 'map', 'chart', 'diagram', 'graph', 'text', 
      'page', 'document', 'sheet', 'invoice', 'receipt', 'slide', 'photocopy'
    ],
    'Objects & Products': [
      'cup', 'glass', 'mug', 'bottle', 'plate', 'dish', 'bowl', 'spoon', 'fork', 'knife', 'chair', 
      'table', 'desk', 'sofa', 'couch', 'bench', 'bed', 'closet', 'drawer', 'laptop', 'computer', 
      'keyboard', 'mouse', 'cellphone', 'smartphone', 'telephone', 'camera', 'watch', 'clock', 
      'shoe', 'boot', 'hat', 'bag', 'backpack', 'wallet', 'umbrella', 'toy', 'doll', 'game', 'ball', 
      'instrument', 'guitar', 'violin', 'piano', 'drum', 'tool', 'hammer', 'wrench', 'screwdriver', 
      'pencil', 'pen', 'book', 'key', 'lock', 'coin', 'money', 'food', 'fruit', 'apple', 'banana', 
      'orange', 'bread', 'cake', 'cookie', 'pizza', 'burger'
    ]
  };

  for (const [category, keywords] of Object.entries(mapping)) {
    if (keywords.some(keyword => normalized.includes(keyword))) {
      return category;
    }
  }

  // Fallback category if no keyword matches
  return 'Illustrations & Graphics';
}

/**
 * Classifies a file path and returns its mapped category.
 * If not an image, uses file extensions.
 */
export async function classifyImage(
  filePath: string,
  onLog?: (msg: string) => void
): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  // Only classify images with the ML model
  if (!['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) {
    // Non-image files sorted by extension
    if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf'].includes(ext)) {
      return 'Documents & Diagrams';
    }
    if (['.emf', '.wmf', '.eps', '.svg', '.psd', '.ai'].includes(ext)) {
      return 'Illustrations & Graphics';
    }
    if (['.otf', '.ttf', '.woff', '.woff2'].includes(ext)) {
      return 'Fonts';
    }
    if (['.mp3', '.wav', '.aac', '.mp4', '.mov', '.avi', '.mkv', '.flv'].includes(ext)) {
      return 'Audio & Video';
    }
    return 'Other Assets';
  }

  try {
    const classifier = await getClassifier();
    const results = await classifier(filePath);
    
    if (results && results.length > 0) {
      const topResult = results[0];
      
      // If confidence score is low (< 0.20), classify as Illustrations & Graphics by default.
      if (topResult.score < 0.20) {
        if (onLog) {
          onLog(`[AI] Classification low confidence (${(topResult.score * 100).toFixed(0)}% for "${topResult.label}"). Categorizing as "Illustrations & Graphics"`);
        }
        return 'Illustrations & Graphics';
      }

      const mappedCategory = mapLabelToCategory(topResult.label);
      if (onLog) {
        onLog(`[AI] Classed "${path.basename(filePath)}" as "${topResult.label}" (${(topResult.score * 100).toFixed(0)}% confidence) -> folder: "${mappedCategory}"`);
      }
      return mappedCategory;
    }
  } catch (err: any) {
    if (onLog) {
      onLog(`[AI WARNING] Classifier failed for "${path.basename(filePath)}": ${err.message}. Defaulting to "Illustrations & Graphics"`);
    }
  }

  return 'Illustrations & Graphics';
}
