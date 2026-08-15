"use client";
import * as React from "react";
import { UploadCloud, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function UploadWidget({
  onFileProcessed,
  processing,
}: {
  onFileProcessed: (file: File) => void;
  processing: boolean;
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    onFileProcessed(files[0]);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors",
        dragOver ? "border-primary-500 bg-primary-50 dark:bg-primary-500/10" : "border-border bg-secondary/30 hover:bg-secondary/60"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {processing ? (
        <>
          <Loader2 className="mb-3 h-9 w-9 animate-spin text-primary-600" />
          <p className="text-sm font-semibold text-foreground">Running OCR extraction...</p>
          <p className="mt-1 text-xs text-muted-foreground">Parsing invoice fields with AI document intelligence</p>
        </>
      ) : (
        <>
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-500/15">
            <UploadCloud size={26} />
          </div>
          <p className="text-sm font-semibold text-foreground">Drag & drop an invoice here</p>
          <p className="mt-1 text-xs text-muted-foreground">or click to browse — supports PDF, PNG, JPG</p>
          <div className="mt-3 flex items-center gap-1 text-[11px] text-muted-foreground">
            <FileText size={12} /> Max file size 10MB
          </div>
        </>
      )}
    </div>
  );
}
