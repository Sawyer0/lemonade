import { Upload } from 'lucide-react';
import { Toolbar, Link } from 'konsta/react';

interface ChatFooterInputProps {
    sessionId?: string;
    setShowFileUpload: (show: boolean) => void;
}

export function ChatFooterInput({ sessionId, setShowFileUpload }: ChatFooterInputProps) {
    if (!sessionId) return null;

    return (
        <div className="pb-safe">
            <Toolbar className="bg-zinc-900/90 backdrop-blur-md border-t border-white/5 left-0 bottom-0 fixed w-full">
                <Link
                    onClick={() => setShowFileUpload(true)}
                    className="w-full flex items-center justify-center gap-2 text-zinc-300 font-bold"
                >
                    <Upload className="w-5 h-5 text-zinc-400" />
                    Upload Video or Audio File
                </Link>
            </Toolbar>
        </div>
    );
}
